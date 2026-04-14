const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const METERSPHERE_CONF = process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';

let pool = null;

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

async function executeQuery(sql, timeout = 30000, limit = 1000) {
  const pool = createPool();
  const startTime = Date.now();

  // 仅对 SELECT 查询自动注入 LIMIT
  const isSelect = /^\s*SELECT\s/i.test(sql);
  if (isSelect && !/LIMIT\s+\d+/i.test(sql)) {
    sql = `${sql} LIMIT ${limit}`;
  }

  try {
    const [rows] = await pool.query({ sql, timeout });
    const executionTime = Date.now() - startTime;

    const limitedRows = Array.isArray(rows) ? rows.slice(0, limit) : [];
    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

    return {
      success: true,
      columns,
      rows: limitedRows,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      executionTime,
      truncated: Array.isArray(rows) && rows.length > limit
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

module.exports = { executeQuery, testConnection };
