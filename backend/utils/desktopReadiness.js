'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
async function acknowledge(version, { env = process.env, updatesRoot = path.join(os.homedir(), '.metersphere-control-panel', 'updates') } = {}) {
  const nonce = env.MS_UPDATE_NONCE;
  const target = env.MS_UPDATE_READY_FILE;
  if (!nonce && !target) return false;
  if (!/^[a-f0-9]{64}$/.test(nonce || '') || env.MS_UPDATE_EXPECTED_VERSION !== version) throw new Error('更新就绪参数不匹配');
  const root = await fs.realpath(updatesRoot);
  const directory = await fs.realpath(path.dirname(String(target || '')));
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || path.basename(target) !== `ready-${nonce}`) throw new Error('更新就绪文件路径不可信');
  const file = path.join(directory, `ready-${nonce}`);
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(`${version}\n${nonce}\n${process.pid}\n`); await handle.sync(); }
  finally { await handle.close(); }
  return true;
}
module.exports = { acknowledge };
