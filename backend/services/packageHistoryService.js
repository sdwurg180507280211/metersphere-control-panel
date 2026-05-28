const mysql = require('mysql2/promise');
const fs = require('fs');

let writePool = null;
let tableEnsured = false;

/**
 * 读取数据库配置，按优先级：
 * 1. configManager.getResolvedConfig().properties.metersphere
 * 2. process.env.MS_PROPERTIES_PATH
 * 3. /opt/metersphere/conf/metersphere.properties
 */
function resolvePropertiesPath() {
  try {
    const configManager = require('./configManager');
    const resolved = configManager.getResolvedConfig();
    if (resolved?.properties?.metersphere) {
      return resolved.properties.metersphere;
    }
  } catch {
    // configManager 不可用时回退
  }
  return process.env.MS_PROPERTIES_PATH || '/opt/metersphere/conf/metersphere.properties';
}

function readDatabaseConfig() {
  const propsPath = resolvePropertiesPath();
  if (!fs.existsSync(propsPath)) {
    throw new Error(`配置文件不存在: ${propsPath}`);
  }

  const content = fs.readFileSync(propsPath, 'utf8');
  // 支持 jdbc:mysql://host:port/database?...，端口可选，数据库名不限制为 \w+
  const urlMatch = content.match(/spring\.datasource\.url\s*=\s*jdbc:mysql:\/\/([^:]+)(?::(\d+))?\/([^\s?]+)/);
  const userMatch = content.match(/spring\.datasource\.username\s*=\s*(.+)/);
  const passMatch = content.match(/spring\.datasource\.password\s*=\s*(.+)/);

  if (!urlMatch || !userMatch) {
    throw new Error('无法解析数据库配置');
  }

  return {
    host: urlMatch[1].trim(),
    port: urlMatch[2] ? parseInt(urlMatch[2], 10) : 3306,
    database: urlMatch[3].trim(),
    user: userMatch[1].trim(),
    password: passMatch ? passMatch[1].trim() : ''
  };
}

function createWritePool() {
  if (!writePool) {
    const config = readDatabaseConfig();
    writePool = mysql.createPool({
      ...config,
      connectionLimit: 3,
      queueLimit: 5,
      waitForConnections: true
    });
  }
  return writePool;
}

/* ── 建表 DDL（完整字段） ── */
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS package_build_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  services JSON,
  image_versions JSON,
  next_image_versions JSON,
  changelog TEXT,
  exit_code INT,
  duration_ms BIGINT,
  script_path VARCHAR(512),
  parallel_build TINYINT(1) DEFAULT 0,
  max_jobs INT DEFAULT 4,
  operator VARCHAR(64) DEFAULT 'system',
  started_at DATETIME,
  finished_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  build_only TINYINT(1) DEFAULT 0,
  package_path VARCHAR(1024),
  error_code VARCHAR(64),
  error_message TEXT,
  error_details JSON,
  release_items JSON,
  git_branch VARCHAR(256),
  git_commit VARCHAR(64),
  git_subject TEXT,
  previous_success_commit VARCHAR(64),
  commits JSON,
  changed_files JSON,
  change_summary JSON,
  metadata_warnings JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_job_id (job_id),
  INDEX idx_git_branch_status (git_branch, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

/* ── 字段迁移定义 ── */
const MIGRATION_COLUMNS = [
  { name: 'started_at',               sql: 'ALTER TABLE package_build_history ADD COLUMN started_at DATETIME' },
  { name: 'finished_at',              sql: 'ALTER TABLE package_build_history ADD COLUMN finished_at DATETIME' },
  { name: 'updated_at',               sql: 'ALTER TABLE package_build_history ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
  { name: 'build_only',               sql: 'ALTER TABLE package_build_history ADD COLUMN build_only TINYINT(1) DEFAULT 0' },
  { name: 'package_path',             sql: 'ALTER TABLE package_build_history ADD COLUMN package_path VARCHAR(1024)' },
  { name: 'error_code',               sql: 'ALTER TABLE package_build_history ADD COLUMN error_code VARCHAR(64)' },
  { name: 'error_message',            sql: 'ALTER TABLE package_build_history ADD COLUMN error_message TEXT' },
  { name: 'error_details',            sql: 'ALTER TABLE package_build_history ADD COLUMN error_details JSON' },
  { name: 'release_items',            sql: 'ALTER TABLE package_build_history ADD COLUMN release_items JSON' },
  { name: 'git_branch',               sql: 'ALTER TABLE package_build_history ADD COLUMN git_branch VARCHAR(256)' },
  { name: 'git_commit',               sql: 'ALTER TABLE package_build_history ADD COLUMN git_commit VARCHAR(64)' },
  { name: 'git_subject',              sql: 'ALTER TABLE package_build_history ADD COLUMN git_subject TEXT' },
  { name: 'previous_success_commit',  sql: 'ALTER TABLE package_build_history ADD COLUMN previous_success_commit VARCHAR(64)' },
  { name: 'commits',                  sql: 'ALTER TABLE package_build_history ADD COLUMN commits JSON' },
  { name: 'changed_files',            sql: 'ALTER TABLE package_build_history ADD COLUMN changed_files JSON' },
  { name: 'change_summary',           sql: 'ALTER TABLE package_build_history ADD COLUMN change_summary JSON' },
  { name: 'metadata_warnings',        sql: 'ALTER TABLE package_build_history ADD COLUMN metadata_warnings JSON' }
];

const MIGRATION_INDEXES = [
  { name: 'idx_git_branch_status',    sql: 'ALTER TABLE package_build_history ADD INDEX idx_git_branch_status (git_branch, status)' }
];

async function migrateTable(pool) {
  try {
    const dbName = readDatabaseConfig().database;

    // 获取已有字段
    const [columns] = await pool.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'package_build_history']
    );
    const existingColumns = new Set(columns.map((r) => r.COLUMN_NAME));

    for (const col of MIGRATION_COLUMNS) {
      if (!existingColumns.has(col.name)) {
        await pool.query(col.sql);
        console.info(`migration: 添加字段 ${col.name}`);
      }
    }

    // 获取已有索引
    const [indexes] = await pool.query(
      'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbName, 'package_build_history']
    );
    const existingIndexes = new Set(indexes.map((r) => r.INDEX_NAME));

    for (const idx of MIGRATION_INDEXES) {
      if (!existingIndexes.has(idx.name)) {
        try {
          await pool.query(idx.sql);
          console.info(`migration: 添加索引 ${idx.name}`);
        } catch (err) {
          // 索引可能已存在但名称不同，忽略
          console.warn(`migration: 添加索引 ${idx.name} 失败: ${err.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`migration 失败: ${error.message}`);
    throw error;
  }
}

async function ensureTable() {
  try {
    const pool = createWritePool();
    await pool.query(CREATE_TABLE_SQL);
    await migrateTable(pool);
    tableEnsured = true;
    console.info('package_build_history 表已就绪');
  } catch (error) {
    tableEnsured = false;
    console.error(`package_build_history 建表/迁移失败: ${error.message}`);
    throw error;
  }
}

function isReady() {
  return tableEnsured && writePool !== null;
}

async function ensureReady() {
  if (!isReady()) {
    await ensureTable();
  }
  return true;
}

/* ── 字段映射：snake_case DB → camelCase DTO ── */
function mapRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    services: parseJson(row.services),
    imageVersions: parseJson(row.image_versions),
    nextImageVersions: parseJson(row.next_image_versions),
    changelog: row.changelog,
    exitCode: row.exit_code,
    durationMs: row.duration_ms,
    scriptPath: row.script_path,
    parallelBuild: row.parallel_build === 1,
    maxJobs: row.max_jobs,
    operator: row.operator,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
    buildOnly: row.build_only === 1,
    packagePath: row.package_path,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorDetails: parseJson(row.error_details),
    releaseItems: parseJson(row.release_items),
    gitBranch: row.git_branch,
    gitCommit: row.git_commit,
    gitSubject: row.git_subject,
    previousSuccessCommit: row.previous_success_commit,
    commits: parseJson(row.commits),
    changedFiles: parseJson(row.changed_files),
    changeSummary: parseJson(row.change_summary),
    metadataWarnings: parseJson(row.metadata_warnings),
    createdAt: row.created_at
  };
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/* ── CRUD ── */

/**
 * 打包完成时写入历史记录
 */
async function createRecord(params) {
  try {
    await ensureReady();
  } catch (error) {
    console.warn(`packageHistoryService 未就绪，跳过历史记录写入: ${error.message}`);
    return null;
  }

  const {
    jobId,
    status,
    services,
    serviceImageVersions,
    nextImageVersions,
    exitCode,
    durationMs,
    scriptPath,
    parallelBuild,
    maxJobs,
    changelog,
    // 新字段
    buildOnly,
    packagePath,
    startedAt,
    finishedAt,
    errorCode,
    errorMessage,
    errorDetails,
    releaseItems,
    gitBranch,
    gitCommit,
    gitSubject,
    previousSuccessCommit,
    commits,
    changedFiles,
    changeSummary,
    metadataWarnings
  } = params;

  try {
    const pool = createWritePool();
    const [result] = await pool.execute(
      `INSERT INTO package_build_history
       (job_id, status, services, image_versions, next_image_versions,
        changelog, exit_code, duration_ms, script_path, parallel_build, max_jobs,
        build_only, package_path, started_at, finished_at,
        error_code, error_message, error_details,
        release_items,
        git_branch, git_commit, git_subject, previous_success_commit,
        commits, changed_files, change_summary, metadata_warnings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        status,
        JSON.stringify(services || []),
        JSON.stringify(serviceImageVersions || {}),
        nextImageVersions ? JSON.stringify(nextImageVersions) : null,
        changelog || null,
        exitCode ?? null,
        durationMs ?? null,
        scriptPath || null,
        parallelBuild ? 1 : 0,
        maxJobs || null,
        buildOnly ? 1 : 0,
        packagePath || null,
        formatDateTime(startedAt),
        formatDateTime(finishedAt),
        errorCode || null,
        errorMessage || null,
        errorDetails ? JSON.stringify(errorDetails) : null,
        releaseItems ? JSON.stringify(releaseItems) : null,
        gitBranch || null,
        gitCommit || null,
        gitSubject || null,
        previousSuccessCommit || null,
        commits ? JSON.stringify(commits) : null,
        changedFiles ? JSON.stringify(changedFiles) : null,
        changeSummary ? JSON.stringify(changeSummary) : null,
        metadataWarnings ? JSON.stringify(metadataWarnings) : null
      ]
    );
    console.info(`打包历史记录已写入: id=${result.insertId}, job=${jobId}, status=${status}`);
    return result.insertId;
  } catch (error) {
    console.error(`打包历史记录写入失败: ${error.message}`);
    return null;
  }
}

/**
 * 分页查询历史记录
 */
async function listRecords({ page = 1, pageSize = 20 } = {}) {
  await ensureReady();
  const pool = createWritePool();
  const offset = (page - 1) * pageSize;

  try {
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM package_build_history'),
      pool.query(
        'SELECT * FROM package_build_history ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [pageSize, offset]
      )
    ]);

    return { records: rows.map(mapRecord), total: countRows[0].total, page, pageSize };
  } catch (error) {
    console.error(`查询打包历史失败: ${error.message}`);
    throw error;
  }
}

/**
 * 单条查询
 */
async function getRecordById(id) {
  await ensureReady();
  const pool = createWritePool();
  try {
    const [rows] = await pool.query('SELECT * FROM package_build_history WHERE id = ?', [id]);
    return rows[0] ? mapRecord(rows[0]) : null;
  } catch (error) {
    console.error(`查询打包历史详情失败: ${error.message}`);
    throw error;
  }
}

/**
 * 更新变更说明（发布备注）
 */
async function updateChangelog(id, changelog) {
  await ensureReady();

  try {
    const pool = createWritePool();
    const [result] = await pool.execute(
      'UPDATE package_build_history SET changelog = ? WHERE id = ?',
      [changelog, id]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error(`更新变更说明失败: ${error.message}`);
    throw error;
  }
}

/**
 * 获取同分支上一次成功打包的 commit
 */
async function getLatestSuccessfulCommit({ branch } = {}) {
  if (!branch) {
    return null;
  }

  try {
    await ensureReady();
    const pool = createWritePool();
    const [rows] = await pool.query(
      'SELECT git_commit FROM package_build_history WHERE git_branch = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
      [branch, 'succeeded']
    );
    return rows[0]?.git_commit || null;
  } catch (error) {
    console.error(`查询上一次成功 commit 失败: ${error.message}`);
    return null;
  }
}

/**
 * 关闭连接池
 */
async function closePool() {
  if (writePool) {
    try {
      await writePool.end();
      console.info('packageHistoryService 连接池已关闭');
    } catch (error) {
      console.error(`packageHistoryService 连接池关闭失败: ${error.message}`);
    }
    writePool = null;
    tableEnsured = false;
  }
}

module.exports = {
  ensureTable,
  ensureReady,
  isReady,
  createRecord,
  listRecords,
  getRecordById,
  updateChangelog,
  getLatestSuccessfulCommit,
  closePool
};
