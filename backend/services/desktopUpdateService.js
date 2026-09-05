const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const DEFAULT_REPOSITORY = 'sdwurg180507280211/metersphere-control-panel';
const RELEASE_TAG_PREFIX = 'desktop-v';
const APP_NAME = 'Local Service Hub';
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_REDIRECTS = 6;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
]);

function normalizeVersion(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^desktop-v/i, '')
    .replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`无效版本号: ${value}`);
  }
  return {
    text: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])]
  };
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).parts;
  const b = normalizeVersion(right).parts;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function electronFetch(url, options) {
  const { net } = require('electron');
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'manual', useSessionCookies: false });
    for (const [name, value] of Object.entries(options.headers)) request.setHeader(name, value);
    let responseStream;
    const abort = () => {
      responseStream?.destroy(options.signal.reason);
      request.abort();
      reject(options.signal.reason);
    };
    options.signal.addEventListener('abort', abort, { once: true });
    request.on('close', () => options.signal.removeEventListener('abort', abort));
    request.on('error', reject);
    request.on('redirect', (status, method, redirectUrl) => {
      // Electron 28 net.fetch rejects manual redirects; expose them for validation.
      resolve(new Response(null, { status, headers: { location: redirectUrl } }));
      request.abort();
    });
    request.on('response', response => {
      responseStream = response;
      response.on('aborted', () => response.destroy(new Error('更新连接中断')));
      const headers = new Headers();
      for (const [name, values] of Object.entries(response.headers)) {
        for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value);
      }
      resolve(new Response(Readable.toWeb(response), { status: response.statusCode, headers }));
    });
    if (options.signal.aborted) abort();
    else request.end();
  });
}

async function withUpdateResponse(url, options, consume) {
  // Electron's network stack honors macOS system proxies; Node HTTPS does not.
  const fetchResponse = process.versions?.electron
    ? electronFetch
    : globalThis.fetch;
  const controller = new AbortController();
  const timeoutMessage = options.download ? '下载安装包超时' : '连接更新服务超时';
  const timer = setTimeout(() => controller.abort(new Error(timeoutMessage)),
    options.download ? DOWNLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  try {
    let target = new URL(url);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (target.protocol !== 'https:') throw new Error('更新服务只允许 HTTPS');
      if (options.download && !ALLOWED_DOWNLOAD_HOSTS.has(target.hostname)) {
        throw new Error(`不允许的下载主机: ${target.hostname}`);
      }
      const response = await fetchResponse(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'User-Agent': `Local-Service-Hub/${options.version || 'unknown'}`,
          Accept: options.accept || 'application/vnd.github+json'
        }
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        if (redirects === MAX_REDIRECTS) throw new Error('更新请求重定向次数过多');
        target = new URL(location, target);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`更新服务返回 HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      try {
        return await consume(response, controller.signal);
      } finally {
        if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestText(url, options = {}) {
  return withUpdateResponse(url, options, async (response) => {
    const chunks = [];
    let total = 0;
    for await (const chunk of Readable.fromWeb(response.body)) {
      total += chunk.length;
      if (total > MAX_JSON_BYTES) throw new Error('更新元数据过大');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  });
}

async function requestJson(url, options = {}) {
  const text = await requestText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('更新服务返回了无效 JSON');
  }
}

function ensureGitHubAssetUrl(rawUrl, repository = DEFAULT_REPOSITORY) {
  let target;
  try {
    target = new URL(String(rawUrl || ''));
  } catch {
    throw new Error('Release 下载地址无效');
  }
  const expectedPrefix = `/${repository}/releases/download/`;
  if (target.protocol !== 'https:' || target.hostname !== 'github.com' || !target.pathname.startsWith(expectedPrefix)) {
    throw new Error('Release 下载地址不在允许的 GitHub 路径中');
  }
  return target.toString();
}

async function downloadFile(url, destination, options = {}) {
  const temporary = `${destination}.download`;
  try {
    return await withUpdateResponse(url, {
      ...options, download: true, accept: 'application/octet-stream'
    }, async (response, signal) => {
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      const digest = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        }
      });
      await pipeline(Readable.fromWeb(response.body), digest,
        fs.createWriteStream(temporary, { mode: 0o600 }), { signal });
      const sha256 = hash.digest('hex');
      await fsp.rename(temporary, destination);
      return { path: destination, bytes, sha256 };
    });
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function selectDesktopRelease(releases) {
  return (Array.isArray(releases) ? releases : [])
    .filter((release) => !release?.draft && !release?.prerelease && String(release?.tag_name || '').startsWith(RELEASE_TAG_PREFIX))
    .map((release) => {
      try {
        return { release, version: normalizeVersion(release.tag_name).text };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version))[0] || null;
}

function selectAsset(metadata, arch) {
  const normalizedArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : null;
  if (!normalizedArch) throw new Error(`暂不支持当前架构: ${arch}`);

  const asset = (Array.isArray(metadata?.assets) ? metadata.assets : []).find((item) => (
    item?.arch === normalizedArch && item?.type === 'zip'
  ));
  if (!asset?.name || !asset?.url || !/^[a-f0-9]{64}$/i.test(String(asset.sha256 || ''))) {
    throw new Error(`Release 缺少 ${normalizedArch} ZIP 或 SHA256`);
  }
  return {
    name: String(asset.name),
    url: ensureGitHubAssetUrl(asset.url),
    sha256: String(asset.sha256).toLowerCase(),
    arch: normalizedArch,
    type: 'zip'
  };
}

async function fetchLatestMetadata(options = {}) {
  const repository = options.repository || DEFAULT_REPOSITORY;
  const releasesUrl = `https://api.github.com/repos/${repository}/releases?per_page=30`;
  let releases;
  try {
    releases = await requestJson(releasesUrl, { version: options.currentVersion });
  } catch (error) {
    if (error.status !== 403 && error.status !== 429) throw error;
    // GitHub's public latest-release asset route does not consume API quota.
    // Fail closed if another release channel is marked latest.
    const metadata = await requestJson(`https://github.com/${repository}/releases/latest/download/latest.json`, {
      version: options.currentVersion, accept: 'application/json'
    });
    if (!/^desktop-v\d+\.\d+\.\d+$/.test(String(metadata.tag || ''))) {
      throw new Error('GitHub API 限流，最新公开 Release 不是正式 Desktop 版本');
    }
    const version = normalizeVersion(metadata.version).text;
    if (metadata.tag !== `${RELEASE_TAG_PREFIX}${version}`) {
      throw new Error('Release 版本与 latest.json 不一致');
    }
    const expectedPrefix = `https://github.com/${repository}/releases/download/${metadata.tag}/`;
    if (!Array.isArray(metadata.assets) || !metadata.assets.length || metadata.assets.some(asset => (
      !ensureGitHubAssetUrl(asset.url, repository).startsWith(expectedPrefix)
    ))) throw new Error('Release 资产与 Desktop 标签不一致');
    return { ...metadata, version, releaseUrl: `https://github.com/${repository}/releases/tag/${metadata.tag}` };
  }
  const selected = selectDesktopRelease(releases);
  if (!selected) {
    return null;
  }

  const metadataAsset = (selected.release.assets || []).find((asset) => asset?.name === 'latest.json');
  if (!metadataAsset?.browser_download_url) {
    throw new Error(`${selected.release.tag_name} 缺少 latest.json`);
  }

  const metadataUrl = ensureGitHubAssetUrl(metadataAsset.browser_download_url, repository);
  const metadata = await requestJson(metadataUrl, {
    version: options.currentVersion,
    accept: 'application/json'
  });
  const metadataVersion = normalizeVersion(metadata.version).text;
  if (metadataVersion !== selected.version) {
    throw new Error(`Release 版本与 latest.json 不一致: ${selected.version} / ${metadataVersion}`);
  }

  return {
    ...metadata,
    version: metadataVersion,
    tag: selected.release.tag_name,
    releaseUrl: selected.release.html_url || metadata.releaseUrl || ''
  };
}

async function checkForUpdate(options = {}) {
  const currentVersion = normalizeVersion(options.currentVersion).text;
  const metadata = await fetchLatestMetadata({
    currentVersion,
    repository: options.repository
  });

  if (!metadata) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      notes: '',
      asset: null
    };
  }

  const asset = selectAsset(metadata, options.arch || process.arch);
  return {
    currentVersion,
    latestVersion: metadata.version,
    updateAvailable: compareVersions(metadata.version, currentVersion) > 0,
    notes: String(metadata.notes || ''),
    publishedAt: metadata.publishedAt || null,
    releaseUrl: metadata.releaseUrl || '',
    asset
  };
}

async function findAppBundle(directory, depth = 0) {
  if (depth > 4) return null;
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.name === `${APP_NAME}.app`) return fullPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith('.app')) continue;
    const result = await findAppBundle(path.join(directory, entry.name), depth + 1);
    if (result) return result;
  }
  return null;
}

async function readBundleVersion(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const executable = path.join(appPath, 'Contents', 'MacOS', APP_NAME);
  await fsp.access(plist, fs.constants.R_OK);
  await fsp.access(executable, fs.constants.X_OK);
  const { stdout } = await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    plist
  ]);
  return normalizeVersion(stdout.trim()).text;
}

async function prepareUpdate(update, options = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('当前在线安装流程仅支持 macOS');
  }
  if (!update?.updateAvailable || !update?.asset) {
    throw new Error('当前没有可安装的新版本');
  }

  const baseDir = options.baseDir || path.join(os.homedir(), '.metersphere-control-panel', 'updates');
  const updateDir = path.join(baseDir, `${update.latestVersion}-${update.asset.arch}`);
  const zipPath = path.join(updateDir, update.asset.name);
  const extractDir = path.join(updateDir, 'extracted');

  await fsp.rm(updateDir, { recursive: true, force: true });
  await fsp.mkdir(updateDir, { recursive: true });

  const downloaded = await downloadFile(update.asset.url, zipPath, {
    version: update.currentVersion
  });
  if (downloaded.sha256 !== update.asset.sha256) {
    await fsp.rm(updateDir, { recursive: true, force: true });
    throw new Error(`SHA256 校验失败：期望 ${update.asset.sha256}，实际 ${downloaded.sha256}`);
  }

  await fsp.mkdir(extractDir, { recursive: true });
  await execFileAsync('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
  const stagedAppPath = await findAppBundle(extractDir);
  if (!stagedAppPath) {
    throw new Error('更新包中未找到 Local Service Hub.app');
  }

  const bundleVersion = await readBundleVersion(stagedAppPath);
  if (bundleVersion !== normalizeVersion(update.latestVersion).text) {
    throw new Error(`更新包版本不匹配: ${bundleVersion} / ${update.latestVersion}`);
  }

  return {
    updateDir,
    stagedAppPath,
    version: bundleVersion,
    sha256: downloaded.sha256,
    bytes: downloaded.bytes
  };
}

function createHelperScript() {
  return `#!/bin/bash
set -euo pipefail

CURRENT_PID="$1"
TARGET_APP="$2"
STAGED_APP="$3"
UPDATE_DIR="$4"
APP_NAME="${APP_NAME}"
TARGET_EXECUTABLE="$TARGET_APP/Contents/MacOS/$APP_NAME"
NEW_APP="${TARGET_APP}.new"
BACKUP_APP="${TARGET_APP}.previous"
LOG_FILE="$UPDATE_DIR/update-helper.log"

exec >>"$LOG_FILE" 2>&1
printf '[%s] updater started\\n' "$(date '+%Y-%m-%d %H:%M:%S')"

for _ in {1..150}; do
  if ! kill -0 "$CURRENT_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if kill -0 "$CURRENT_PID" >/dev/null 2>&1; then
  echo '旧版本未能在限定时间内退出'
  exit 1
fi

rm -rf "$NEW_APP"
ditto "$STAGED_APP" "$NEW_APP"
test -f "$NEW_APP/Contents/Info.plist"
test -x "$NEW_APP/Contents/MacOS/$APP_NAME"

rm -rf "$BACKUP_APP"
if [[ -d "$TARGET_APP" ]]; then
  mv "$TARGET_APP" "$BACKUP_APP"
fi

rollback() {
  echo '新版本启动失败，恢复旧版本'
  rm -rf "$TARGET_APP"
  if [[ -d "$BACKUP_APP" ]]; then
    mv "$BACKUP_APP" "$TARGET_APP"
    open "$TARGET_APP" >/dev/null 2>&1 || true
  fi
}

if ! mv "$NEW_APP" "$TARGET_APP"; then
  rollback
  exit 1
fi

if ! open "$TARGET_APP"; then
  rollback
  exit 1
fi

started=false
for _ in {1..100}; do
  if pgrep -f "$TARGET_EXECUTABLE" >/dev/null 2>&1; then
    started=true
    break
  fi
  sleep 0.1
done

if [[ "$started" != 'true' ]]; then
  rollback
  exit 1
fi

sleep 2
if ! pgrep -f "$TARGET_EXECUTABLE" >/dev/null 2>&1; then
  rollback
  exit 1
fi

rm -rf "$BACKUP_APP"
printf '[%s] update completed\\n' "$(date '+%Y-%m-%d %H:%M:%S')"
`;
}

async function launchInstallHelper(options = {}) {
  if (process.platform !== 'darwin') throw new Error('在线安装仅支持 macOS');
  const targetAppPath = path.resolve(String(options.targetAppPath || ''));
  const stagedAppPath = path.resolve(String(options.stagedAppPath || ''));
  const updateDir = path.resolve(String(options.updateDir || ''));
  const currentPid = Number(options.currentPid);

  if (!targetAppPath.endsWith(`/${APP_NAME}.app`) || !Number.isInteger(currentPid) || currentPid <= 0) {
    throw new Error('更新安装参数无效');
  }

  await fsp.access(path.dirname(targetAppPath), fs.constants.W_OK);
  await fsp.access(stagedAppPath, fs.constants.R_OK);

  const helperPath = path.join(updateDir, 'install-update.sh');
  await fsp.writeFile(helperPath, createHelperScript(), { mode: 0o700 });

  const child = spawn('/bin/bash', [
    helperPath,
    String(currentPid),
    targetAppPath,
    stagedAppPath,
    updateDir
  ], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { helperPath };
}

module.exports = {
  DEFAULT_REPOSITORY,
  RELEASE_TAG_PREFIX,
  normalizeVersion,
  compareVersions,
  checkForUpdate,
  prepareUpdate,
  launchInstallHelper
};
