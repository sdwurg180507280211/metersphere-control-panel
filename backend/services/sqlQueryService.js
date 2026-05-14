const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';

let pool = null;

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;
const READ_ONLY_PREFIXES = /^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i;
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|GRANT|REVOKE|SET|USE|CALL|LOAD|LOCK|UNLOCK|MERGE|RENAME|ANALYZE|OPTIMIZE|REPAIR|HANDLER|INSTALL|UNINSTALL)\b/i;
const FORBIDDEN_READ_PATTERNS = /\bINTO\s+(OUTFILE|DUMPFILE)\b|\bFOR\s+UPDATE\b/i;

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function stripTrailingSemicolon(sql) {
  return sql.trim().replace(/;\s*$/, '').trim();
}

function hasMultipleStatements(sql) {
  const withoutStrings = sql
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/`([^`\\]|\\.)*`/g, '``');
  return /;\s*\S/.test(withoutStrings);
}

function validateReadOnlySql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    return { valid: false, error: '无效的 SQL 查询' };
  }

  const normalized = stripTrailingSemicolon(sql);
  if (hasMultipleStatements(normalized)) {
    return { valid: false, error: '只允许执行单条只读 SQL' };
  }

  if (!READ_ONLY_PREFIXES.test(normalized)) {
    return { valid: false, error: '只允许执行 SELECT、SHOW、DESCRIBE、DESC、EXPLAIN 查询' };
  }

  if (WRITE_KEYWORDS.test(normalized) || FORBIDDEN_READ_PATTERNS.test(normalized)) {
    return { valid: false, error: 'SQL 包含非只读或高风险语句' };
  }

  return { valid: true, sql: normalized };
}

function readDatabaseConfig() {
  if (!fs.existsSync(METERSPHERE_CONF)) {
    throw new Error(`配置文件不存在: ${METERSPHERE_CONF}`);
  }

  const content = fs.readFileSync(METERSPHERE_CONF, 'utf8');
  const urlMatch = content.match(/spring\.datasource\.url\s*=\s*jdbc:mysql:\/\/([^:]+):(\d+)\/(\w+)/);
  const userMatch = content.match(/spring\.datasource\.username\s*=\s*(.+)/);
  const passMatch = content.match(/spring\.datasource\.password\s*=\s*(.+)/);

  if (!urlMatch || !userMatch) {
    throw new Error('无法解析数据库配置');
  }

  return {
    host: urlMatch[1].trim(),
    port: parseInt(urlMatch[2], 10),
    database: urlMatch[3].trim(),
    user: userMatch[1].trim(),
    password: passMatch ? passMatch[1].trim() : ''
  };
}

function createPool() {
  if (!pool) {
    const config = readDatabaseConfig();
    pool = mysql.createPool({
      ...config,
      connectionLimit: 2,
      queueLimit: 5,
      waitForConnections: true
    });
  }
  return pool;
}

async function executeQuery(sql, timeout = 30000, limit = DEFAULT_LIMIT) {
  const validation = validateReadOnlySql(sql);
  if (!validation.valid) {
    return {
      success: false,
      readonlyViolation: true,
      error: validation.error
    };
  }

  const safeLimit = normalizeLimit(limit);
  let safeSql = validation.sql;
  const pool = createPool();
  const startTime = Date.now();

  // 仅对 SELECT 查询自动注入 LIMIT
  const isSelect = /^\s*SELECT\s/i.test(safeSql);
  if (isSelect && !/\bLIMIT\s+\d+\b/i.test(safeSql)) {
    safeSql = `${safeSql} LIMIT ${safeLimit}`;
  }

  try {
    const [rows] = await pool.query({ sql: safeSql, timeout });
    const executionTime = Date.now() - startTime;

    const limitedRows = Array.isArray(rows) ? rows.slice(0, safeLimit) : [];
    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

    return {
      success: true,
      columns,
      rows: limitedRows,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      executionTime,
      truncated: Array.isArray(rows) && rows.length > safeLimit
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
    const pool = createPool();
    await pool.query('SELECT 1');
    const config = readDatabaseConfig();
    return {
      connected: true,
      database: config.database,
      host: config.host
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = { executeQuery, testConnection, validateReadOnlySql, normalizeLimit };
