const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

class NodeVersionService {
  constructor() { this.cached = null; this.pending = null; this.cacheKey = ''; }
  async scan({ force = false } = {}) {
    const key = `${process.env.PATH || ''}:${os.homedir()}`;
    if (!force && this.cached && this.cacheKey === key && Date.now() - Date.parse(this.cached.scannedAt) < 60000) return structuredClone(this.cached);
    if (this.pending) return this.pending.then(structuredClone);
    this.pending = this._scan().then((value) => { this.cached = value; this.cacheKey = key; return value; });
    try { return structuredClone(await this.pending); } finally { this.pending = null; }
  }
  async _scan() {
    const candidates = [];
    const add = (bin, source) => candidates.push({ nodePath: path.join(bin, 'node'), npmPath: path.join(bin, 'npm'), source });
    const versions = async (directory, source, suffix) => {
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries.slice(0, 128)) if (entry.isDirectory()) add(path.join(directory, entry.name, suffix), source);
    };
    await Promise.all([
      versions(path.join(os.homedir(), '.nvm/versions/node'), 'nvm', 'bin'),
      versions(path.join(os.homedir(), 'n/node'), 'n', 'bin'),
      versions(path.join(os.homedir(), '.local/share/fnm/node-versions'), 'fnm', 'installation/bin'),
      versions(path.join(os.homedir(), 'Library/Application Support/fnm/node-versions'), 'fnm', 'installation/bin')
    ]);
    for (const bin of ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin']) add(bin, 'system');
    for (const bin of (process.env.PATH || '').split(path.delimiter).filter(Boolean).slice(0, 128)) add(bin, 'PATH');
    const seen = new Set();
    const discovered = [];
    // Bounded parallelism and a wall deadline avoid freezing the Electron event loop.
    let next = 0;
    const deadline = Date.now() + 10000;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < candidates.length && Date.now() < deadline) {
        const candidate = candidates[next++];
        try {
          const realNode = await fs.realpath(candidate.nodePath);
          if (seen.has(realNode)) continue;
          seen.add(realNode);
          let version = 'unknown';
          try {
            const { stdout } = await exec(realNode, ['--version'], { timeout: Math.max(1, Math.min(1500, deadline - Date.now())), maxBuffer: 4096, windowsHide: true });
            if (/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(stdout.trim())) version = stdout.trim();
          } catch {}
          let npmPath = candidate.npmPath;
          try { await fs.access(npmPath); } catch { npmPath = ''; }
          discovered.push({ ...candidate, npmPath, version, isCurrent: realNode === await fs.realpath(process.execPath) });
        } catch {}
      }
    }));
    discovered.sort((a, b) => this._compareSemVer(b.version, a.version));
    return { versions: discovered, scannedAt: new Date().toISOString(), count: discovered.length, partial: next < candidates.length };
  }
  _compareSemVer(a, b) {
    const left = String(a).replace(/^v/, '').split('.').map(Number);
    const right = String(b).replace(/^v/, '').split('.').map(Number);
    for (let index = 0; index < 3; index += 1) if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
    return 0;
  }
}
module.exports = new NodeVersionService();
