const fs = require('fs');
const path = require('path');
const { CONFIG_PATH, loadConfigFromFile } = require('../config');
const { createAppError } = require('../utils/errors');

const APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function readConfig() {
  return loadConfigFromFile(CONFIG_PATH) || {};
}

function writeConfig(rawConfig) {
  const directory = path.dirname(CONFIG_PATH);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = `${CONFIG_PATH}.desktop.tmp`;
  const backupPath = `${CONFIG_PATH}.bak`;

  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, backupPath);
  }

  fs.writeFileSync(tempPath, `${JSON.stringify(rawConfig, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, CONFIG_PATH);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'local-app';
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function exists(root, name) {
  return fs.existsSync(path.join(root, name));
}

function detectPackageManager(root) {
  if (exists(root, 'pnpm-lock.yaml')) return 'pnpm';
  if (exists(root, 'yarn.lock')) return 'yarn';
  if (exists(root, 'bun.lockb') || exists(root, 'bun.lock')) return 'bun';
  return 'npm';
}

function buildNodeCandidates(root, packageJson) {
  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts
    : {};
  const manager = detectPackageManager(root);
  const preferred = ['dev', 'start', 'serve', 'preview'];
  const orderedNames = [
    ...preferred.filter((name) => scripts[name]),
    ...Object.keys(scripts).filter((name) => !preferred.includes(name)).sort()
  ].slice(0, 12);

  return orderedNames.map((script) => ({
    label: `${manager} ${manager === 'npm' ? 'run ' : ''}${script}`,
    runtime: 'node',
    command: manager,
    args: manager === 'npm' ? ['run', script] : [script],
    source: `package.json#scripts.${script}`
  }));
}

function detectSuggestedPort(packageJson, candidates) {
  const scripts = packageJson?.scripts || {};
  for (const candidate of candidates) {
    const scriptName = candidate.args?.[candidate.args.length - 1];
    const script = scripts[scriptName];
    if (!script) continue;
    const match = String(script).match(/(?:--port(?:=|\s+)|\bPORT=)(\d{2,5})\b/i);
    if (match) return Number(match[1]);
  }

  const deps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {})
  };
  if (deps.vite) return 5173;
  if (deps.next) return 3000;
  return null;
}

function detectDirectory(cwd) {
  const root = path.resolve(String(cwd || '').trim());
  if (!cwd || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw createAppError(400, 'DESKTOP_APP_DIRECTORY_INVALID', '请选择存在的项目目录', { cwd });
  }

  const candidates = [];
  const detectedTypes = [];
  let suggestedName = path.basename(root);
  let suggestedRuntime = 'process';
  let suggestedPort = null;

  const packagePath = path.join(root, 'package.json');
  const packageJson = exists(root, 'package.json') ? readJson(packagePath) : null;
  if (packageJson) {
    const nodeCandidates = buildNodeCandidates(root, packageJson);
    candidates.push(...nodeCandidates);
    detectedTypes.push('node');
    suggestedName = String(packageJson.name || suggestedName);
    suggestedRuntime = 'node';
    suggestedPort = detectSuggestedPort(packageJson, nodeCandidates);
  }

  const pythonFiles = ['app.py', 'main.py', 'manage.py'];
  const pythonEntry = pythonFiles.find((file) => exists(root, file));
  if (pythonEntry || exists(root, 'pyproject.toml') || exists(root, 'requirements.txt')) {
    detectedTypes.push('python');
    if (!packageJson) suggestedRuntime = 'python';
    if (pythonEntry === 'manage.py') {
      candidates.push({ label: 'python manage.py runserver', runtime: 'python', command: 'python3', args: ['manage.py', 'runserver'], source: 'manage.py' });
      if (!suggestedPort) suggestedPort = 8000;
    } else if (pythonEntry) {
      candidates.push({ label: `python3 ${pythonEntry}`, runtime: 'python', command: 'python3', args: [pythonEntry], source: pythonEntry });
    }
  }

  if (exists(root, 'pom.xml')) {
    detectedTypes.push('maven');
    const command = exists(root, 'mvnw') ? './mvnw' : 'mvn';
    candidates.push({ label: `${command} spring-boot:run`, runtime: 'java', command, args: ['spring-boot:run'], source: 'pom.xml' });
    if (!packageJson && suggestedRuntime === 'process') suggestedRuntime = 'java';
    if (!suggestedPort) suggestedPort = 8080;
  }

  if (exists(root, 'build.gradle') || exists(root, 'build.gradle.kts')) {
    detectedTypes.push('gradle');
    const command = exists(root, 'gradlew') ? './gradlew' : 'gradle';
    candidates.push({ label: `${command} bootRun`, runtime: 'java', command, args: ['bootRun'], source: exists(root, 'build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle' });
    if (!packageJson && suggestedRuntime === 'process') suggestedRuntime = 'java';
    if (!suggestedPort) suggestedPort = 8080;
  }

  if (exists(root, 'start.sh')) {
    detectedTypes.push('shell');
    candidates.push({ label: './start.sh', runtime: 'shell', command: './start.sh', args: [], source: 'start.sh' });
    if (detectedTypes.length === 1) suggestedRuntime = 'shell';
  }

  const uniqueCandidates = candidates.filter((candidate, index, list) => (
    list.findIndex((item) => item.command === candidate.command && JSON.stringify(item.args) === JSON.stringify(candidate.args)) === index
  ));

  return {
    cwd: root,
    detectedTypes,
    suggestedName,
    suggestedId: slugify(suggestedName),
    suggestedRuntime,
    suggestedPort,
    candidates: uniqueCandidates
  };
}

function normalizeArgs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeEnv(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), String(item)]));
}

function normalizeDefinition(input = {}) {
  const id = String(input.id || '').trim().toLowerCase();
  if (!APP_ID_PATTERN.test(id)) {
    throw createAppError(400, 'DESKTOP_APP_ID_INVALID', '应用 ID 仅允许小写字母、数字、点、下划线和中划线，最长 64 位');
  }

  const cwd = path.resolve(String(input.cwd || '').trim());
  if (!input.cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw createAppError(400, 'DESKTOP_APP_CWD_NOT_FOUND', '应用工作目录不存在', { cwd: input.cwd });
  }

  const start = input.start && typeof input.start === 'object' ? input.start : {};
  const command = String(start.command || '').trim();
  if (!command) {
    throw createAppError(400, 'DESKTOP_APP_COMMAND_MISSING', '请选择或填写启动命令');
  }

  const portValue = input.port === '' || input.port === null || input.port === undefined
    ? null
    : Number(input.port);
  if (portValue !== null && (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535)) {
    throw createAppError(400, 'DESKTOP_APP_PORT_INVALID', '端口必须是 1-65535 的整数');
  }

  return {
    id,
    definition: {
      name: String(input.name || id).trim() || id,
      group: String(input.group || '本地应用').trim() || '本地应用',
      runtime: String(input.runtime || 'process').trim() || 'process',
      enabled: input.enabled !== false,
      cwd,
      ...(portValue ? { port: portValue } : {}),
      start: {
        command,
        args: normalizeArgs(start.args),
        ...(Object.keys(normalizeEnv(start.env)).length > 0 ? { env: normalizeEnv(start.env) } : {})
      },
      healthCheck: portValue
        ? { type: 'port', host: '127.0.0.1', port: portValue }
        : { type: 'process' }
    }
  };
}

function saveApp(input) {
  const { id, definition } = normalizeDefinition(input);
  const raw = readConfig();
  raw.desktopApplications = raw.desktopApplications && typeof raw.desktopApplications === 'object' && !Array.isArray(raw.desktopApplications)
    ? raw.desktopApplications
    : {};
  raw.desktopApplications[id] = definition;
  writeConfig(raw);
  return { id, ...definition };
}

function removeApp(id) {
  const appId = String(id || '').trim();
  const raw = readConfig();
  if (!raw.desktopApplications?.[appId]) {
    throw createAppError(404, 'DESKTOP_APP_NOT_FOUND', `未找到桌面应用: ${appId}`, { appId });
  }
  delete raw.desktopApplications[appId];
  if (Object.keys(raw.desktopApplications).length === 0) delete raw.desktopApplications;
  writeConfig(raw);
  return { id: appId };
}

function hasApp(id) {
  const raw = readConfig();
  return Boolean(raw.desktopApplications?.[id]);
}

module.exports = {
  detectDirectory,
  saveApp,
  removeApp,
  hasApp
};
