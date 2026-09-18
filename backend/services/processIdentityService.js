'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const crypto = require('node:crypto');

function validPid(pid) { return Number.isSafeInteger(Number(pid)) && Number(pid) > 1 && Number(pid) !== process.pid; }
async function command(executable, args) {
  const { stdout } = await exec(executable, args, { encoding: 'utf8', timeout: 2500, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
async function inspect(pid) {
  if (!validPid(pid)) return null;
  pid = Number(pid);
  try {
    if (process.platform === 'linux') {
      const [before, cwd, argv, bootId] = await Promise.all([
        fsp.readFile(`/proc/${pid}/stat`, 'utf8'), fsp.realpath(`/proc/${pid}/cwd`),
        fsp.readFile(`/proc/${pid}/cmdline`, 'utf8'),
        fsp.readFile('/proc/sys/kernel/random/boot_id', 'utf8')
      ]);
      const after = await fsp.readFile(`/proc/${pid}/stat`, 'utf8');
      const started = (value) => value.slice(value.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
      if (!started(before) || started(before) !== started(after)) return null;
      return { pid, started: `${bootId.trim()}:${started(before)}`, cwd, argv: argv.split('\0').filter(Boolean) };
    }
    if (process.platform === 'darwin') {
      const started = await command('ps', ['-p', String(pid), '-o', 'lstart=']);
      const cmdline = await command('ps', ['-p', String(pid), '-o', 'command=']);
      const cwdLines = await command('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
      const cwdPath = cwdLines.split('\n').find((line) => line.startsWith('n'))?.slice(1);
      const after = await command('ps', ['-p', String(pid), '-o', 'lstart=']);
      if (!started || started !== after || !cwdPath) return null;
      return { pid, started, cwd: await fsp.realpath(cwdPath), command: cmdline };
    }
    // Unsupported discovery fails closed instead of treating a recycled PID as owned.
    return null;
  } catch { return null; }
}
function hasPom(observation, absolutePom, relativePom) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (observation.argv) {
    const args = observation.argv;
    const maven = args.some((arg) => ['mvn', 'mvnw', 'mvn.cmd', 'mvnw.cmd'].includes(path.basename(arg))
      || arg === 'org.codehaus.plexus.classworlds.launcher.Launcher');
    if (!maven) return false;
    for (let index = 0; index < args.length; index += 1) {
      let value = null;
      if (args[index] === '-f' || args[index] === '--file') value = args[index + 1];
      else if (args[index].startsWith('--file=')) value = args[index].slice(7);
      else if (args[index].startsWith('-f') && args[index].length > 2) value = args[index].slice(2);
      if (value && path.resolve(observation.cwd, value) === absolutePom) return true;
    }
    return false;
  }
  const command = observation.command || '';
  if (!/(?:mvnw?|org\.codehaus\.plexus\.classworlds\.launcher\.Launcher)/.test(command)) return false;
  return [absolutePom, relativePom, `./${relativePom}`].some((pom) =>
    new RegExp(`(?:^|\\s)(?:-f\\s+|--file(?:=|\\s+))["']?${escape(pom)}(?=$|[\\s"'])`).test(command));
}
async function context({ projectRoot, pom }) {
  if (!projectRoot || !pom) return null;
  try {
    const root = await fsp.realpath(projectRoot);
    const absolutePom = await fsp.realpath(path.resolve(root, pom));
    const relativePom = path.relative(root, absolutePom);
    if (relativePom.startsWith('..') || path.isAbsolute(relativePom)) return null;
    return { root, absolutePom, relativePom };
  } catch { return null; }
}
async function identify(pid, options, saved = null, inspectProcess = inspect) {
  if (!validPid(pid)) return null;
  const ctx = await context(options);
  if (!ctx) return null;
  const observed = await inspectProcess(Number(pid));
  if (!observed || observed.pid !== Number(pid) || !observed.started || observed.cwd !== ctx.root) return null;
  if (saved) {
    if (saved.schema !== 1 || saved.pid !== Number(pid) || saved.started !== observed.started
      || saved.projectRoot !== ctx.root || saved.pom !== ctx.absolutePom) return null;
  } else if (!hasPom(observed, ctx.absolutePom, ctx.relativePom)) return null;
  return { schema: 1, pid: Number(pid), started: observed.started, projectRoot: ctx.root, pom: ctx.absolutePom };
}
function identityPath(pidDirectory, serviceId) {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(serviceId) || serviceId === '.' || serviceId === '..') throw new Error('服务 ID 无效');
  return path.join(pidDirectory, `${serviceId}.identity.json`);
}
function readIdentity(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; return { invalid: true }; }
}
function saveIdentity(file, record) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temp, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}
module.exports = { validPid, inspect, identify, identityPath, readIdentity, saveIdentity };
