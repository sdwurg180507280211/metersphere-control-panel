'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function revision(raw) { return crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex'); }
function conflict(message) { return Object.assign(new Error(message), { statusCode: 409, code: 'CONFIG_CONFLICT' }); }
function read(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('配置根节点必须是对象');
    return raw;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw Object.assign(new Error(`无法安全读取配置 ${file}: ${error.message}`), { code: 'CONFIG_READ_FAILED', statusCode: 500, cause: error });
  }
}
function privateWrite(file, text) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, text, 'utf8'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function syncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function assertOrdinaryFile(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`拒绝覆盖非普通配置文件: ${file}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function transaction(file, update, { expectedRevision } = {}) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertOrdinaryFile(file);
  const lock = `${file}.lock`;
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') {
      const error = conflict('配置正在被其他进程写入，请稍后重试；若持续出现，请保留草稿并按配置锁恢复指引核验，勿直接删除锁文件。');
      error.details = { lockFile: lock, recoveryGuide: 'docs/RELIABILITY-2026-09-18.md#配置锁恢复' };
      throw error;
    }
    throw error;
  }
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  const backupTemp = `${file}.${crypto.randomUUID()}.bak.tmp`;
  try {
    fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    const latest = read(file);
    if (expectedRevision && revision(latest) !== expectedRevision) throw conflict('配置已变化，请刷新后重新保存');
    const next = update(structuredClone(latest));
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('配置更新必须返回对象');
    // Serialize before touching the original. Corrupt config is never replaced with {}.
    const text = `${JSON.stringify(next, null, 2)}\n`;
    privateWrite(temp, text);
    if (fs.existsSync(file)) {
      assertOrdinaryFile(`${file}.bak`);
      privateWrite(backupTemp, fs.readFileSync(file, 'utf8'));
      fs.renameSync(backupTemp, `${file}.bak`);
    }
    fs.renameSync(temp, file);
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
    syncDirectory(directory);
    return { raw: next, revision: revision(next) };
  } finally {
    for (const item of [temp, backupTemp]) { try { fs.unlinkSync(item); } catch {} }
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
// Change only keys owned by this editor; concurrent edits to other domains survive.
function mergeOwned(latest, base, next, keys, { normalize = (raw) => raw } = {}) {
  const merged = structuredClone(latest);
  // Compare effective values, not incidental default materialization by another editor.
  // Keep the raw representation from the requested change for actual persistence.
  const oldComparable = normalize(structuredClone(base || {}));
  const latestComparable = normalize(structuredClone(latest));
  const nextComparable = normalize(structuredClone(next));
  for (const key of keys) {
    const oldValue = JSON.stringify(oldComparable?.[key]);
    const desired = JSON.stringify(nextComparable?.[key]);
    if (oldValue === desired) continue;
    if (JSON.stringify(latestComparable[key]) !== oldValue && JSON.stringify(latestComparable[key]) !== desired) {
      throw conflict(`配置字段 ${key} 已被其他入口修改，请刷新后保存`);
    }
    if (Object.prototype.hasOwnProperty.call(next, key)) merged[key] = structuredClone(next[key]);
    else delete merged[key];
  }
  return merged;
}
module.exports = { read, revision, transaction, mergeOwned };
