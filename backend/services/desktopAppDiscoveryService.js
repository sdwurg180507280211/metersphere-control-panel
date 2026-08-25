const fs = require('fs');
const os = require('os');
const path = require('path');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const desktopAppConfigService = require('./desktopAppConfigService');

const MARKERS = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'start.sh'
]);

const IGNORED_DIRS = new Set([
  '.git', '.idea', '.vscode', 'node_modules', 'dist', 'build', 'target',
  'coverage', '.next', '.turbo', '.cache', '.venv', 'venv', 'vendor', 'out'
]);

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function hasProjectMarker(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isFile() && MARKERS.has(entry.name));
  } catch {
    return false;
  }
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'local-app';
}

function uniqueExistingDirs(values) {
  const seen = new Set();
  return values.flatMap((value) => {
    if (!value) return [];
    const resolved = path.resolve(String(value));
    if (seen.has(resolved) || !isDirectory(resolved)) return [];
    seen.add(resolved);
    return [resolved];
  });
}

function getDiscoveryRoots() {
  const raw = loadConfigFromFile(CONFIG_PATH) || {};
  const configuredRoots = Array.isArray(raw.desktopDiscoveryRoots) ? raw.desktopDiscoveryRoots : [];
  const projectRoot = raw.projectRoot ? path.resolve(String(raw.projectRoot)) : null;
  const cwd = process.cwd();
  const home = os.homedir();

  return uniqueExistingDirs([
    ...configuredRoots,
    projectRoot ? path.dirname(projectRoot) : null,
    path.dirname(cwd),
    path.join(home, 'ideaProjects'),
    path.join(home, 'Workspace'),
    path.join(home, 'Projects'),
    path.join(home, 'Developer'),
    path.join(home, 'Code')
  ]);
}

function scanRoot(root, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 2;
  const maxDirs = Number.isInteger(options.maxDirs) ? options.maxDirs : 240;
  const queue = [{ dir: root, depth: 0 }];
  const projects = [];
  let visited = 0;

  while (queue.length > 0 && visited < maxDirs) {
    const current = queue.shift();
    visited += 1;

    if (current.depth > 0 && hasProjectMarker(current.dir)) {
      projects.push(current.dir);
      continue;
    }

    if (current.depth >= maxDepth) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      if (queue.length + visited >= maxDirs) break;
    }
  }

  return projects;
}

function normalizeRegisteredApps() {
  const raw = loadConfigFromFile(CONFIG_PATH) || {};
  const apps = raw.desktopApplications && typeof raw.desktopApplications === 'object' && !Array.isArray(raw.desktopApplications)
    ? raw.desktopApplications
    : {};
  return Object.entries(apps).map(([id, app]) => ({
    id,
    cwd: app?.cwd ? path.resolve(String(app.cwd)) : null
  }));
}

function enhanceDetection(detection) {
  const candidates = [...(detection.candidates || [])];
  const dshCandidate = candidates.find((candidate) => candidate.source === 'package.json#scripts.dsh');
  if (dshCandidate) {
    const command = 'npm';
    const args = ['run', 'dsh', '--', 'web'];
    const exists = candidates.some((candidate) => candidate.command === command && JSON.stringify(candidate.args) === JSON.stringify(args));
    if (!exists) {
      candidates.unshift({
        label: 'npm run dsh -- web',
        runtime: 'node',
        command,
        args,
        source: 'package.json#scripts.dsh + web'
      });
    }
  }

  const folderName = path.basename(detection.cwd || '');
  const scopedPackageName = String(detection.suggestedName || '').startsWith('@');
  const monorepoName = scopedPackageName && folderName
    ? { suggestedName: folderName, suggestedId: slugify(folderName) }
    : {};

  return { ...detection, ...monorepoName, candidates };
}

function discoverProjects() {
  const roots = getDiscoveryRoots();
  const registered = normalizeRegisteredApps();
  const seen = new Set();
  const projectDirs = roots.flatMap((root) => scanRoot(root));

  const projects = projectDirs.flatMap((cwd) => {
    const resolved = path.resolve(cwd);
    if (seen.has(resolved)) return [];
    seen.add(resolved);

    let detection;
    try {
      detection = enhanceDetection(desktopAppConfigService.detectDirectory(resolved));
    } catch {
      return [];
    }

    const registeredApp = registered.find((app) => app.cwd === resolved) || null;
    return [{
      ...detection,
      registered: Boolean(registeredApp),
      registeredId: registeredApp?.id || null
    }];
  });

  projects.sort((a, b) => {
    if (a.registered !== b.registered) return Number(a.registered) - Number(b.registered);
    return String(a.suggestedName || a.cwd).localeCompare(String(b.suggestedName || b.cwd));
  });

  return {
    roots,
    projects,
    scannedAt: new Date().toISOString()
  };
}

module.exports = {
  discoverProjects,
  getDiscoveryRoots
};
