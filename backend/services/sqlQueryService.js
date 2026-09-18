const mysql = require('mysql2/promise');
const fs = require('fs');
const os = require('os');
const path = require('path');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';
const READONLY_CONF = process.env.MS_SQL_READONLY_PROPERTIES_PATH
  || path.join(os.homedir(), '.metersphere-control-panel', 'sql-readonly.properties');

const { singleFlightPool } = require('../utils/singleFlightPool');
const { acquire, runQuery } = require('../utils/boundedSql');
const activeQueryConnections = new Set();
const activeQueryControllers = new Set();
let closingQueries = false;
let pool = null;
let verifiedAccount = null;

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const ALLOWED_READONLY_PRIVILEGES = new Set([
  'USAGE',
  'SELECT',
  'SHOW VIEW',
  'SHOW DATABASES'
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
  const [identityRows] = await connection.query({ sql: 'SELECT CURRENT_USER() AS currentUser', timeout: 5000 });
  const currentUser = identityRows?.[0]?.currentUser || 'unknown';
  const [grantRows] = await connection.query({ sql: 'SHOW GRANTS FOR CURRENT_USER()', timeout: 5000 });

  const grants = grantRows.flatMap((row) => Object.values(row).map(String));
  const privileges = grants.flatMap(extractPrivileges);
  const unsupportedGrants = grants.filter((statement) => {
    const normalized = statement.trim();
    return /^GRANT\s+/i.test(normalized) && !/^GRANT\s+.+?\s+ON\s+/i.test(normalized);
  });
  const forbidden = [...new Set(privileges.filter(
    (privilege) => !ALLOWED_READONLY_PRIVILEGES.has(privilege)
  ))];
  const hasGrantOption = grants.some((statement) => /\bWITH\s+GRANT\s+OPTION\b/i.test(statement));

  if (forbidden.length > 0 || unsupportedGrants.length > 0 || hasGrantOption) {
    const reasons = [];
    if (forbidden.length > 0) reasons.push(`非只读权限: ${forbidden.join(', ')}`);
    if (unsupportedGrants.length > 0) reasons.push('存在无法安全展开的角色或动态授权');
    if (hasGrantOption) reasons.push('存在 GRANT OPTION');
    throw new Error(`SQL 工作区账号 ${currentUser} 未通过只读校验，${reasons.join('；')}`);
  }

  return {
    currentUser,
    grants,
    verifiedAt: new Date().toISOString()
  };
}

const poolManager = singleFlightPool(async () => {
  const config = readDatabaseConfig();
  const candidatePool = mysql.createPool({ ...config, connectionLimit: 2, queueLimit: 5,
    waitForConnections: true, multipleStatements: false, connectTimeout: 5000,
    supportBigNumbers: true, bigNumberStrings: true });
  let connection;
  try {
    connection = await candidatePool.getConnection();
    const account = await verifyReadonlyAccount(connection);
    verifiedAccount = account;
    pool = candidatePool;
    return candidatePool;
  } catch (error) {
    connection?.release(); connection = null;
    await candidatePool.end().catch(() => {});
    throw error;
  } finally { connection?.release(); }
});
async function createPool() { return poolManager.get(); }

async function executeQuery(sql, timeout = 30000, limit = DEFAULT_LIMIT, options = {}) {
  if (typeof sql !== 'string' || !sql.trim()) return { success: false, error: '无效的 SQL 语句' };
  if (closingQueries) return { success: false, code: 'POOL_CLOSING', error: 'SQL 连接正在关闭' };
  const safeTimeout = Number.isFinite(Number(timeout)) ? Math.min(60000, Math.max(100, Number(timeout))) : 30000;
  let connection;
  const cancellation = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, cancellation.signal]) : cancellation.signal;
  activeQueryControllers.add(cancellation);
  try {
    const activePool = await createPool();
    if (closingQueries) throw Object.assign(new Error('SQL 连接正在关闭'), { code: 'POOL_CLOSING' });
    connection = await acquire(activePool.pool, { timeout: Math.min(10000, safeTimeout), signal });
    if (closingQueries) { connection.destroy(); throw Object.assign(new Error('SQL 连接正在关闭'), { code: 'POOL_CLOSING' }); }
    activeQueryConnections.add(connection);
    return await runQuery(connection, sql.trim(), { limit: normalizeLimit(limit), timeout: safeTimeout, signal });
  } catch (error) {
    return { success: false, error: error.message, code: error.code };
  } finally { activeQueryControllers.delete(cancellation); if (connection) activeQueryConnections.delete(connection); }
}

async function testConnection() {
  try {
    const activePool = await createPool();
    await activePool.query({ sql: 'SELECT 1', timeout: 5000 });
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
  closingQueries = true;
  for (const controller of activeQueryControllers) controller.abort();
  activeQueryControllers.clear();
  activeQueryConnections.clear();
  try { await poolManager.close(); }
  finally { pool = null; verifiedAccount = null; closingQueries = false; }
}

module.exports = {
  executeQuery,
  testConnection,
  normalizeLimit,
  readDatabaseConfig,
  verifyReadonlyAccount,
  closePool
};
