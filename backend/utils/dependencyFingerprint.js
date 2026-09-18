'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const versions = new Map();
async function toolchain(command, argsPrefix, env) {
  const key = JSON.stringify([command, argsPrefix, env.PATH, env.Path]);
  const cached = versions.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const { stdout } = await exec(command, [...argsPrefix, '--versions', '--json'], { env, timeout: 5000, maxBuffer: 16384, windowsHide: true });
    const parsed = JSON.parse(stdout);
    if (!parsed.node || !parsed.npm) throw new Error('无法识别实际构建 Node/npm 版本');
    return { node: String(parsed.node), npm: String(parsed.npm) };
  })();
  versions.set(key, { expires: Date.now() + 60000, promise });
  try { return await promise; } catch (error) { versions.delete(key); throw error; }
}
async function fingerprint(frontendDir, moduleConfig, { command, argsPrefix = [], env = process.env }, readVersions = toolchain) {
  const names = [...new Set(['package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc', ...(moduleConfig.lockfiles || [])])];
  const hash = crypto.createHash('sha256');
  const sources = [];
  for (const name of names) {
    if (path.basename(name) !== name) throw new Error('依赖指纹只允许模块目录内的文件');
    const file = path.join(frontendDir, name);
    if (fs.existsSync(file)) {
      hash.update(name).update('\0').update(fs.readFileSync(file)).update('\0'); sources.push(name);
    }
  }
  if (!sources.includes('package.json')) return null;
  const runtime = await readVersions(command, argsPrefix, env);
  hash.update(JSON.stringify({ command, argsPrefix, runtime, platform: process.platform, arch: process.arch,
    installCommand: moduleConfig.installCommand || null, installArgs: moduleConfig.installArgs || [], nodeOptions: env.NODE_OPTIONS || '' }));
  return { schema: 2, source: sources.join('+'), npmPath: command, ...runtime, hash: hash.digest('hex') };
}
module.exports = { fingerprint, toolchain };
