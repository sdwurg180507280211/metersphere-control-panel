const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

class NodeVersionService {
  /**
   * 扫描本机所有 Node.js 安装
   * @returns {{ versions: Array<{nodePath: string, npmPath: string, version: string, source: string, isCurrent: boolean}>, scannedAt: string, count: number }}
   */
  scan() {
    const seen = new Set();
    const versions = [];
    const currentExecPath = process.execPath;

    const addIfValid = (nodePath, npmPath, source) => {
      try {
        if (!fs.existsSync(nodePath)) return;
        if (seen.has(nodePath)) return;
        seen.add(nodePath);

        let version;
        try {
          version = execSync(`"${nodePath}" --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        } catch {
          version = 'unknown';
        }

        const npmExists = fs.existsSync(npmPath);

        versions.push({
          nodePath,
          npmPath: npmExists ? npmPath : '',
          version,
          source,
          isCurrent: nodePath === currentExecPath
        });
      } catch (err) {
        logger.warn(`检测 Node 版本失败 (${nodePath}): ${err.message}`);
      }
    };

    // 1. nvm
    this._scanNvm(addIfValid);

    // 2. fnm
    this._scanFnm(addIfValid);

    // 3. n
    this._scanN(addIfValid);

    // 4. 系统路径
    this._scanSystemPaths(addIfValid);

    // 5. PATH 目录
    this._scanPathDirs(addIfValid);

    // 按版本号降序排序
    versions.sort((a, b) => {
      const va = a.version.replace(/^v/, '');
      const vb = b.version.replace(/^v/, '');
      return this._compareSemVer(vb, va);
    });

    return {
      versions,
      scannedAt: new Date().toISOString(),
      count: versions.length
    };
  }

  _scanNvm(addIfValid) {
    const nvmDir = path.join(os.homedir(), '.nvm/versions/node');
    this._scanVersionDir(nvmDir, 'nvm', addIfValid);
  }

  _scanFnm(addIfValid) {
    const dirs = [
      path.join(os.homedir(), '.local/share/fnm/node-versions'),
      path.join(os.homedir(), 'Library/Application Support/fnm/node-versions')
    ];
    for (const fnmDir of dirs) {
      if (fs.existsSync(fnmDir)) {
        const entries = fs.readdirSync(fnmDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const binDir = path.join(fnmDir, entry.name, 'installation/bin');
          this._addFromBinDir(binDir, 'fnm', addIfValid);
        }
      }
    }
  }

  _scanN(addIfValid) {
    const nDir = path.join(os.homedir(), 'n/node');
    this._scanVersionDir(nDir, 'n', addIfValid);
  }

  _scanSystemPaths(addIfValid) {
    const paths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin'
    ];
    for (const p of paths) {
      const nodePath = path.join(p, 'node');
      const npmPath = path.join(p, 'npm');
      if (fs.existsSync(nodePath)) {
        addIfValid(nodePath, npmPath, 'system');
      }
    }
  }

  _scanPathDirs(addIfValid) {
    if (!process.env.PATH) return;
    const dirs = process.env.PATH.split(path.delimiter);
    for (const dir of dirs) {
      const nodePath = path.join(dir, 'node');
      const npmPath = path.join(dir, 'npm');
      if (fs.existsSync(nodePath)) {
        addIfValid(nodePath, npmPath, 'PATH');
      }
    }
  }

  /**
   * 扫描形如 baseDir/versionString/bin/ 的版本管理器目录
   */
  _scanVersionDir(baseDir, source, addIfValid) {
    if (!fs.existsSync(baseDir)) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const binDir = path.join(baseDir, entry.name, 'bin');
        this._addFromBinDir(binDir, source, addIfValid);
      }
    } catch (err) {
      logger.warn(`扫描 ${source} 目录失败: ${err.message}`);
    }
  }

  _addFromBinDir(binDir, source, addIfValid) {
    if (!fs.existsSync(binDir)) return;
    const nodePath = path.join(binDir, 'node');
    const npmPath = path.join(binDir, 'npm');
    if (fs.existsSync(nodePath)) {
      addIfValid(nodePath, npmPath, source);
    }
  }

  /**
   * 简易语义版本比较（降序用 a vs b，返回正数表示 a > b）
   */
  _compareSemVer(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  }
}

module.exports = new NodeVersionService();
