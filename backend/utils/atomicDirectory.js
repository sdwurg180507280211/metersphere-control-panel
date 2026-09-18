'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function validateTree(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (!entries.length) throw new Error('构建产物目录为空');
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`构建产物包含符号链接: ${entry.name}`);
    if (entry.isDirectory()) await validateTreeAllowEmpty(file);
    else if (!entry.isFile()) throw new Error(`构建产物不是普通文件: ${entry.name}`);
  }
}
async function validateTreeAllowEmpty(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error('产物包含非普通文件');
    if (entry.isDirectory()) await validateTreeAllowEmpty(path.join(directory, entry.name));
  }
}
async function replaceDirectory(source, target, { projectRoot, assertActive = () => {}, io = fs } = {}) {
  if (!projectRoot) throw new Error('缺少项目根目录，拒绝替换构建产物');
  const root = await fs.realpath(projectRoot);
  const src = await fs.realpath(source);
  const requestedTarget = path.resolve(target);
  const parent = await fs.realpath(path.dirname(requestedTarget));
  const dst = path.join(parent, path.basename(requestedTarget));
  if (!inside(root, src) || !inside(root, dst) || !(inside(root, parent) || root === parent)
    || src === dst || inside(src, dst) || inside(dst, src)) {
    throw new Error('构建产物路径越界、包含符号链接或源目录与目标目录重叠');
  }
  if (await exists(dst)) {
    const stat = await fs.lstat(dst);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('目标必须是普通目录');
  }
  await validateTree(src);
  // A fixed lock prevents two tasks from publishing into the same destination.
  const lock = `${dst}.ms-publish.lock`;
  let lockHandle;
  try { lockHandle = await fs.open(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Object.assign(new Error('目标目录有发布事务或待恢复事务'), { code: 'PUBLISH_BUSY' }); throw error; }
  const suffix = crypto.randomUUID();
  const stage = `${dst}.ms-stage-${suffix}`;
  const backup = `${dst}.ms-previous-${suffix}`;
  let moved = false;
  let installed = false;
  let preserveRecovery = false;
  try {
    await lockHandle.writeFile(JSON.stringify({ pid: process.pid, target: dst, stage, backup }));
    await lockHandle.sync();
    await io.cp(src, stage, { recursive: true, errorOnExist: true, force: false });
    await validateTree(stage);
    assertActive();
    if (await exists(dst)) { await io.rename(dst, backup); moved = true; }
    try { await io.rename(stage, dst); installed = true; }
    catch (error) {
      if (moved) {
        try { await io.rename(backup, dst); moved = false; }
        catch (restoreError) {
          preserveRecovery = true;
          throw Object.assign(new Error(`发布失败且恢复需人工处理；旧产物保留于 ${backup}`), {
            code: 'PUBLISH_RECOVERY_REQUIRED', cause: error, restoreError, backup
          });
        }
      }
      throw error;
    }
    if (moved) await io.rm(backup, { recursive: true, force: true }).catch(() => {});
    return { target: dst, installed: true };
  } finally {
    if (!preserveRecovery) await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
    await lockHandle.close();
    if (!preserveRecovery) await fs.unlink(lock).catch(() => {});
    // Never remove backup in finally: it may be the only surviving good version.
  }
}
module.exports = { replaceDirectory, inside };
