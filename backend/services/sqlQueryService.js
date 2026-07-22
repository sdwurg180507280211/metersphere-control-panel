const mysql = require('mysql2/promise');
const fs = require('fs');
const os = require('os');
const path = require('path');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';
const READONLY_CONF = process.env.MS_SQL_READONLY_PROPERTIES_PATH
  || path.join(os.homedir(), '.metersphere-control-panel', 'sql-readonly.properties');

let pool = null;
let verifiedAccount = null;

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const WRITE_PRIVILEGES = new Set([
  'ALL PRIVILEGES',
  'ALTER',
  'ALTER ROUTINE',
  'CREATE',
  'CREATE ROUTINE',
  'CREATE TABLESPACE',
  'CREATE TEMPORARY TABLES',
  'CREATE USER',
  'DELETE',
  'DROP',
  'EVENT',
  'EXECUTE',
  'FILE',
  'GRANT OPTION',
  'INDEX',
  'INSERT',
  'LOCK TABLES',
  'PROCESS',
  'REFERENCES',
  'RELOAD',
  'REPLICATION CLIENT',
  'REPLICATION SLAVE',
  'SHUTDOWN',
  'SUPER',
  'TRIGGER',
  'UPDATE'
]);

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function parseProperties(content) {
  return String(content || '').split(/\r?\n/).reduce((result, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      return result;
    }

    const separatorIndex = trimmed.search(/[:=]/);
    if (separatorIndex < 0) {
      return result;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
    return result;
  }, {});
}

function parseJdbcUrl(value) {
  const match = String(value || '').match(/^jdbc:mysql:\/\/([^:/?#]+)(?::(\d+))?\/([^?]+)/i);
  if (!match) {
    return null;
  }

  return {
    host: match[1],
    port: Number.parseInt(match[2] || '3306', 10),
    database: decodeURIComponent(match[3])
  };
}

function readPropertiesFile(filePath, required = false) {
  if (!filePath || !fs.existsSync(filePath)) {
    if (required) {
      throw new Error(`配置文件不存在: ${filePath}`);
    }
    return {};
  }
  return parseProperties(fs.readFileSync(filePath, 'utf8'));
}

function readDatabaseLocation() {
  const properties = readPropertiesFile(METERSPHERE_CONF, false);
  const jdbc = parseJdbcUrl(properties['spring.datasource.url']);
  return jdbc || {};
}

function readReadonlyProperties() {
  const properties = readPropertiesFile(READONLY_CONF, false);
  const jdbc = parseJdbcUrl(
    properties['spring.datasource.url']
      || properties['datasource.url']
      || properties.url
  );

  return {
    ...(jdbc || {}),
    host: properties['spring.datasource.host'] || properties.host || jdbc?.host,
    port: properties['spring.datasource.port'] || properties.port || jdbc?.port,
    database: properties['spring.datasource.database'] || properties.database || jdbc?.database,
    user: properties['spring.datasource.username'] || properties.username || properties.user,
    password: properties['spring.datasource.password'] || properties.password || ''
  };
}

function readDatabaseConfig() {
  const sourceDatabase = readDatabaseLocation();
  const readonly = readReadonlyProperties();

  const config = {
    host: process.env.MS_SQL_READONLY_HOST || readonly.host || sourceDatabase.host,
    port: Number.parseInt(process.env.MS_SQL_READONLY_PORT || readonly.port || sourceDatabase.port || '3306', 10),
    database: process.env.MS_SQL_READONLY_DATABASE || readonly.database || sourceDatabase.database,
    user: process.env.MS_SQL_READONLY_USER || readonly.user,
    password: process.env.MS_SQL_READONLY_PASSWORD ?? readonly.password ?? ''
  };

  const missing = ['host', 'database', 'user'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `SQL 只读账号配置不完整，缺少: ${missing.join(', ')}。`
      + ' 请设置 MS_SQL_READONLY_USER 等环境变量，或创建独立的 sql-readonly.properties。'
    );
  }

  return config;
}

function extractPrivileges(grantStatement) {
  const statement = String(grantStatement || '').trim();
  const grantMatch = statement.match(/^GRANT\s+(.+?)\s+ON\s+/i);
  if (!grantMatch) {
    return [];
  }

  return grantMatch[1]
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

async function verifyReadonlyAccount(connection) {
  const [identityRows] = await connection.query('SELECT CURRENT_USER() AS currentUser');
  const currentUser = identityRows?.[0]?.currentUser || 'unknown';
  const [grantRows] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');

  const grants = grantRows.flatMap((row) => Object.values(row).map(String));
  const privileges = grants.flatMap(extractPrivileges);
  const forbidden = [...new Set(privileges.filter((privilege) => WRITE_PRIVILEGES.has(privilege)))];

  if (forbidden.length > 0) {
    throw new Error(
      `SQL 工作区账号 ${currentUser} 不是只读账号，检测到高风险权限: ${forbidden.join(', ')}`
    );
  }

  return {
    currentUser,
    grants,
    verifiedAt: new Date().toISOString()
  };
}

async function createPool() {
  if (pool) {
    return pool;
  }

  const config = readDatabaseConfig();
  const candidatePool = mysql.createPool({
    ...config,
    connectionLimit: 2,
    queueLimit: 5,
    waitForConnections: true,
    multipleStatements: false
  });

  let connection;
  try {
    connection = await candidatePool.getConnection();
    verifiedAccount = await verifyReadonlyAccount(connection);
    pool = candidatePool;
    return pool;
  } catch (error) {
    connection?.release();
    connection = null;
    await candidatePool.end().catch(() => {});
    throw error;
  } finally {
    connection?.release();
  }
}

async function executeQuery(sql, timeout = 30000, limit = DEFAULT_LIMIT) {
  if (typeof sql !== 'string' || !sql.trim()) {
    return { success: false, error: '无效的 SQL 语句' };
  }

  const safeLimit = normalizeLimit(limit);
  const activePool = await createPool();
  const startTime = Date.now();

  try {
    // 不在应用层判断 SQL 类型，也不改写 SQL；权限由数据库只读账号负责。
    const [rows, fields] = await activePool.query({ sql: sql.trim(), timeout });
    const executionTime = Date.now() - startTime;

    if (!Array.isArray(rows)) {
      return {
        success: true,
        columns: [],
        rows: [],
        rowCount: rows?.affectedRows || 0,
        executionTime,
        truncated: false,
        metadata: rows || null
      };
    }

    const limitedRows = rows.slice(0, safeLimit);
    const columns = Array.isArray(fields) && fields.length > 0
      ? fields.map((field) => field.name)
      : (limitedRows.length > 0 ? Object.keys(limitedRows[0]) : []);

    return {
      success: true,
      columns,
      rows: limitedRows,
      rowCount: rows.length,
      executionTime,
      truncated: rows.length > safeLimit
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

async function testConnection() {
  try {
    const activePool = await createPool();
    await activePool.query('SELECT 1');
    const config = readDatabaseConfig();
    return {
      connected: true,
      readonlyVerified: true,
      currentUser: verifiedAccount?.currentUser || config.user,
      database: config.database,
      host: config.host,
      configSource: fs.existsSync(READONLY_CONF) ? READONLY_CONF : 'environment'
    };
  } catch (error) {
    return {
      connected: false,
      readonlyVerified: false,
      error: error.message
    };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    verifiedAccount = null;
  }
}

module.exports = {
  executeQuery,
  testConnection,
  normalizeLimit,
  readDatabaseConfig,
  verifyReadonlyAccount,
  closePool
};
