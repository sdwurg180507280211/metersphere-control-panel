const path = require('path');

const MIN_BUILD_NODE_VERSION = '22.12.0';
const TARGET_ELECTRON_VERSION = '44.3.0';

function parseVersion(value, label = '版本') {
  const raw = String(value || '').trim();
  const match = raw.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`${label} 必须是 x.y.z 格式，当前值: ${raw || '<empty>'}`);
  }
  return {
    text: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])]
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left, '左侧版本').parts;
  const b = parseVersion(right, '右侧版本').parts;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function assertSupportedBuildNode(version = process.versions.node) {
  const normalized = parseVersion(version, 'Node.js 版本').text;
  if (compareVersions(normalized, MIN_BUILD_NODE_VERSION) < 0) {
    throw new Error(`Electron ${TARGET_ELECTRON_VERSION} 桌面构建要求 Node.js >= ${MIN_BUILD_NODE_VERSION}，当前为 ${normalized}`);
  }
  return normalized;
}

function getConfiguredElectronVersion(packageJson) {
  const configured = parseVersion(packageJson?.build?.electronVersion, 'build.electronVersion').text;
  if (configured !== TARGET_ELECTRON_VERSION) {
    throw new Error(`build.electronVersion 必须固定为 ${TARGET_ELECTRON_VERSION}，当前为 ${configured}`);
  }
  return configured;
}

function assertPackagedElectronVersion(actualVersion, expectedVersion = TARGET_ELECTRON_VERSION) {
  const actual = parseVersion(actualVersion, '打包后的 Electron 版本').text;
  const expected = parseVersion(expectedVersion, '目标 Electron 版本').text;
  if (actual !== expected) {
    throw new Error(`Electron 运行时版本不一致：期望 ${expected}，实际 ${actual}`);
  }
  return actual;
}

function main() {
  const packageJson = require(path.join('..', 'package.json'));
  const nodeVersion = assertSupportedBuildNode();
  const electronVersion = getConfiguredElectronVersion(packageJson);
  console.log(`Electron packaged runtime: ${electronVersion}; build Node: ${nodeVersion}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Electron runtime 校验失败: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  MIN_BUILD_NODE_VERSION,
  TARGET_ELECTRON_VERSION,
  parseVersion,
  compareVersions,
  assertSupportedBuildNode,
  getConfiguredElectronVersion,
  assertPackagedElectronVersion
};
