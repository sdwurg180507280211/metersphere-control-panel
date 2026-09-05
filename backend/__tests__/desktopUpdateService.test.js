const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { ReadableStream } = require('stream/web');
const { spawnSync } = require('child_process');

function loadTransport(fetchMock, electron = false, timers = {}) {
  const filename = path.resolve(__dirname, '../services/desktopUpdateService.js');
  const net = { request: options => {
    const request = new EventEmitter();
    const headers = {};
    request.setHeader = (name, value) => { headers[name] = value; };
    request.abort = () => request.emit('close');
    request.end = async () => {
      try {
        const response = await fetchMock(options.url, { headers, redirect: options.redirect });
        if (response.status >= 300 && response.status < 400) {
          request.emit('redirect', response.status, 'GET', response.headers.get('location'));
        } else {
          const stream = Readable.fromWeb(response.body);
          stream.headers = Object.fromEntries(response.headers);
          stream.statusCode = response.status;
          stream.on('end', () => request.emit('close'));
          request.emit('response', stream);
        }
      } catch (error) { request.emit('error', error); }
    };
    return request;
  } };
  const sandbox = {
    module: { exports: {} },
    require: name => name === 'electron' ? { net } : require(name),
    process: { versions: electron ? { electron: '28.3.3' } : {} },
    fetch: electron ? () => { throw new Error('Node fetch must not be used'); } : fetchMock,
    URL, AbortController, Buffer, Response, Headers, setTimeout, clearTimeout, ...timers
  };
  vm.runInNewContext(`${fs.readFileSync(filename, 'utf8')}\nmodule.exports = { requestText, downloadFile, checkForUpdate, createHelperScript };`, sandbox);
  return sandbox.module.exports;
}

describe('Desktop updater network transport', () => {
  test('installer script preserves shell variables and has valid Bash syntax', () => {
    const script = loadTransport(jest.fn()).createHelperScript();
    expect(script).toContain('NEW_APP="$TARGET_APP.new"');
    expect(script).toContain('BACKUP_APP="$TARGET_APP.previous"');
    const checked = spawnSync('/bin/bash', ['-n'], { input: script, encoding: 'utf8' });
    expect(checked.stderr).toBe('');
    expect(checked.status).toBe(0);
  });

  test.each([false, true])('installer helper replaces or rolls back a temporary app (launch fails: %s)', launchFails => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-helper-test-'));
    const target = path.join(directory, 'Local Service Hub.app');
    const staged = path.join(directory, 'staged.app');
    const bin = path.join(directory, 'bin');
    try {
      for (const [bundle, version] of [[target, 'old'], [staged, 'new']]) {
        fs.mkdirSync(path.join(bundle, 'Contents', 'MacOS'), { recursive: true });
        fs.writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), version);
        fs.writeFileSync(path.join(bundle, 'Contents', 'MacOS', 'Local Service Hub'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      }
      fs.mkdirSync(bin);
      const commands = {
        ditto: '/bin/cp -R "$1" "$2"',
        open: `exit ${launchFails ? 1 : 0}`,
        pgrep: 'exit 0',
        sleep: 'exit 0'
      };
      for (const [name, body] of Object.entries(commands)) {
        fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      }
      const child = spawnSync('/bin/bash', ['-s', '--', '2147483647', target, staged, directory], {
        input: loadTransport(jest.fn()).createHelperScript(), encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }
      });
      expect(child.status).toBe(launchFails ? 1 : 0);
      expect(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8')).toBe(launchFails ? 'old' : 'new');
      expect(fs.existsSync(`${target}.previous`)).toBe(false);
      expect(fs.existsSync(`${target}.new`)).toBe(false);
      expect(fs.readFileSync(path.join(directory, 'update-helper.log'), 'utf8')).toContain(launchFails ? '恢复旧版本' : 'update completed');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  test('API rate limits fall back to a validated public desktop release', async () => {
    const metadata = {
      version: '2.0.1', tag: 'desktop-v2.0.1',
      assets: [{ name: 'test.zip', arch: 'x64', type: 'zip', sha256: 'a'.repeat(64),
        url: 'https://github.com/sdwurg180507280211/metersphere-control-panel/releases/download/desktop-v2.0.1/test.zip' }]
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(metadata)));
    const result = await loadTransport(fetchMock).checkForUpdate({ currentVersion: '2.0.0', arch: 'x64' });
    expect(result).toMatchObject({ latestVersion: '2.0.1', updateAvailable: true });
    expect(fetchMock.mock.calls[1][0]).toMatch(/releases\/latest\/download\/latest.json$/);
  });

  test.each(['v2.0.1', 'desktop-v2.0.1-beta', 'desktop-v2.0.2'])('fallback rejects unrelated, prerelease or mismatched tag %s', async tag => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '2.0.1', tag, assets: [] })));
    await expect(loadTransport(fetchMock).checkForUpdate({ currentVersion: '2.0.0', arch: 'x64' })).rejects.toThrow();
  });

  test('Electron uses its system-proxy-aware fetch and manual redirects', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/test' } }))
      .mockResolvedValueOnce(new Response('metadata'));
    const transport = loadTransport(fetchMock, true);
    await expect(transport.requestText('https://github.com/test')).resolves.toBe('metadata');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  test('rejects an HTTPS downgrade and excessive redirects', async () => {
    const downgrade = jest.fn(async () => new Response(null, { status: 302, headers: { location: 'http://github.com/test' } }));
    await expect(loadTransport(downgrade).requestText('https://github.com/test')).rejects.toThrow('HTTPS');
    expect(downgrade).toHaveBeenCalledTimes(1);
    const loop = jest.fn(async () => new Response(null, { status: 302, headers: { location: '/test' } }));
    await expect(loadTransport(loop).requestText('https://github.com/test')).rejects.toThrow('重定向次数');
    expect(loop).toHaveBeenCalledTimes(7);
  });

  test('rejects HTTP errors and oversized metadata', async () => {
    await expect(loadTransport(async () => new Response('', { status: 503 })).requestText('https://github.com/test')).rejects.toThrow('503');
    await expect(loadTransport(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))).requestText('https://github.com/test')).rejects.toThrow('元数据过大');
  });

  test('network failures do not silently switch release sources', async () => {
    const fetchMock = jest.fn(async () => new Response('', { status: 500 }));
    await expect(loadTransport(fetchMock).checkForUpdate({ currentVersion: '2.0.0' })).rejects.toThrow('500');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('failed download streams clean up partial files', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-update-test-'));
    const destination = path.join(directory, 'failed.zip');
    try {
      let chunks = 0;
      const body = new ReadableStream({ pull(controller) {
        if (chunks++ === 0) controller.enqueue(Buffer.from('partial'));
        else controller.error(new Error('connection lost'));
      } });
      await expect(loadTransport(async () => new Response(body)).downloadFile('https://github.com/test', destination)).rejects.toThrow('connection lost');
      expect(fs.existsSync(destination)).toBe(false);
      expect(fs.existsSync(`${destination}.download`)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('aborts requests on the total deadline', async () => {
    const fetchMock = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const transport = loadTransport(fetchMock, false, { setTimeout: callback => setTimeout(callback, 10) });
    await expect(transport.requestText('https://github.com/test')).rejects.toThrow('超时');
  });

  test('streams downloads, hashes bytes and rejects untrusted redirect hosts', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-update-test-'));
    const destination = path.join(directory, 'test.zip');
    try {
      const bytes = Buffer.from('test zip bytes');
      const result = await loadTransport(async () => new Response(bytes)).downloadFile('https://github.com/test', destination);
      expect(result.bytes).toBe(bytes.length);
      expect(result.sha256).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
      expect(fs.readFileSync(destination)).toEqual(bytes);
      const redirect = jest.fn(async () => new Response(null, { status: 302, headers: { location: 'https://example.com/test' } }));
      await expect(loadTransport(redirect).downloadFile('https://github.com/test', destination)).rejects.toThrow('不允许的下载主机');
      expect(redirect).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(`${destination}.download`)).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('Delta updates', () => {
  const REPOSITORY = 'sdwurg180507280211/metersphere-control-panel';
  const RELEASES_RESPONSE = () => new Response(JSON.stringify([{
    tag_name: 'desktop-v2.0.4', draft: false, prerelease: false,
    assets: [{ name: 'latest.json', browser_download_url: `https://github.com/${REPOSITORY}/releases/download/desktop-v2.0.4/latest.json` }]
  }]));
  const deltaMetadata = (overrides = {}) => ({
    version: '2.0.4', tag: 'desktop-v2.0.4',
    assets: [
      { name: 'full.zip', arch: 'x64', type: 'zip', bytes: 342000000, sha256: 'b'.repeat(64), url: `https://github.com/${REPOSITORY}/releases/download/desktop-v2.0.4/full.zip` },
      { name: 'full-arm64.zip', arch: 'arm64', type: 'zip', bytes: 330000000, sha256: 'c'.repeat(64), url: `https://github.com/${REPOSITORY}/releases/download/desktop-v2.0.4/full-arm64.zip` }
    ],
    deltas: [{
      name: 'delta.zip', arch: 'x64', bytes: 4800000, sha256: 'd'.repeat(64),
      url: `https://github.com/${REPOSITORY}/releases/download/desktop-v2.0.4/delta.zip`,
      electronVersion: '28.3.3', includesLive2d: false, ...overrides
    }]
  });
  const metadataFetch = (metadata = deltaMetadata()) => jest.fn()
    .mockResolvedValueOnce(RELEASES_RESPONSE())
    .mockResolvedValueOnce(new Response(JSON.stringify(metadata)));

  test('selects the delta asset when the installed Electron version matches', async () => {
    const result = await loadTransport(metadataFetch(), true).checkForUpdate({ currentVersion: '2.0.3', arch: 'x64' });
    expect(result.asset).toMatchObject({
      updateMode: 'delta', bytes: 4800000, includesLive2d: false, electronVersion: '28.3.3',
      url: `https://github.com/${REPOSITORY}/releases/download/desktop-v2.0.4/delta.zip`
    });
  });

  test.each([
    ['Electron 版本不一致', deltaMetadata({ electronVersion: '99.0.0' })],
    ['latest.json 缺少 deltas 字段', { ...deltaMetadata(), deltas: undefined }],
    ['增量包 SHA256 非法', deltaMetadata({ sha256: 'zz' })]
  ])('增量不可用时回退全量包（%s）', async (_name, metadata) => {
    const result = await loadTransport(metadataFetch(metadata), true).checkForUpdate({ currentVersion: '2.0.3', arch: 'x64' });
    expect(result.asset).toMatchObject({ updateMode: 'full', name: 'full.zip' });
  });

  test('plain Node runtime（开发模式）never selects a delta', async () => {
    const result = await loadTransport(metadataFetch()).checkForUpdate({ currentVersion: '2.0.3', arch: 'x64' });
    expect(result.asset).toMatchObject({ updateMode: 'full' });
  });

  test('installer script contains the delta branch and stays valid Bash', () => {
    const script = loadTransport(jest.fn()).createHelperScript();
    expect(script).toContain('MODE="${5:-full}"');
    expect(script).toContain('cp -cR "$TARGET_APP" "$NEW_APP"');
    expect(script).toContain('INCLUDE_LIVE2D');
    const checked = spawnSync('/bin/bash', ['-n'], { input: script, encoding: 'utf8' });
    expect(checked.status).toBe(0);
  });

  const writeStubBin = (bin, commands) => {
    fs.mkdirSync(bin, { recursive: true });
    for (const [name, body] of Object.entries(commands)) {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
  };

  test.each([false, true])('delta helper merges app layer and restores live2d (staged includes live2d: %s)', stagedHasLive2d => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-delta-test-'));
    const target = path.join(directory, 'Local Service Hub.app');
    const staged = path.join(directory, 'delta-root');
    const bin = path.join(directory, 'bin');
    try {
      fs.mkdirSync(path.join(target, 'Contents', 'MacOS'), { recursive: true });
      fs.writeFileSync(path.join(target, 'Contents', 'Info.plist'), 'old');
      fs.writeFileSync(path.join(target, 'Contents', 'MacOS', 'Local Service Hub'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const targetApp = path.join(target, 'Contents', 'Resources', 'app');
      fs.mkdirSync(path.join(targetApp, 'frontend', 'dist', 'live2d'), { recursive: true });
      fs.writeFileSync(path.join(targetApp, 'package.json'), '{"version":"2.0.3"}');
      fs.writeFileSync(path.join(targetApp, 'keep.txt'), 'keep');
      fs.writeFileSync(path.join(targetApp, 'remove-me.txt'), 'stale');
      fs.writeFileSync(path.join(targetApp, 'frontend', 'dist', 'live2d', 'old-model.txt'), 'old model');

      fs.mkdirSync(path.join(staged, 'Contents', 'MacOS'), { recursive: true });
      fs.writeFileSync(path.join(staged, 'Contents', 'Info.plist'), 'new');
      fs.writeFileSync(path.join(staged, 'Contents', 'MacOS', 'Local Service Hub'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const stagedApp = path.join(staged, 'Contents', 'Resources', 'app');
      fs.mkdirSync(stagedApp, { recursive: true });
      fs.writeFileSync(path.join(stagedApp, 'package.json'), '{"version":"2.0.4"}');
      fs.writeFileSync(path.join(stagedApp, 'keep.txt'), 'keep-new');
      fs.writeFileSync(path.join(stagedApp, 'added.txt'), 'added');
      if (stagedHasLive2d) {
        fs.mkdirSync(path.join(stagedApp, 'frontend', 'dist', 'live2d'), { recursive: true });
        fs.writeFileSync(path.join(stagedApp, 'frontend', 'dist', 'live2d', 'old-model.txt'), 'refreshed model');
      }

      writeStubBin(bin, {
        // 近似 ditto 合并语义：目标存在时按内容合并，否则整目录复制
        ditto: 'if [ -d "$2" ]; then /bin/cp -R "$1/." "$2/"; else /bin/cp -R "$1" "$2"; fi',
        open: 'exit 0',
        pgrep: 'exit 0',
        sleep: 'exit 0'
      });
      const child = spawnSync('/bin/bash', ['-s', '--', '2147483647', target, staged, directory, 'delta', stagedHasLive2d ? 'true' : 'false'], {
        input: loadTransport(jest.fn()).createHelperScript(), encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }
      });

      expect(child.status).toBe(0);
      expect(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8')).toBe('new');
      const newAppDir = path.join(target, 'Contents', 'Resources', 'app');
      expect(fs.existsSync(path.join(newAppDir, 'remove-me.txt'))).toBe(false);
      expect(fs.readFileSync(path.join(newAppDir, 'added.txt'), 'utf8')).toBe('added');
      expect(fs.readFileSync(path.join(newAppDir, 'keep.txt'), 'utf8')).toBe('keep-new');
      const live2dDir = path.join(newAppDir, 'frontend', 'dist', 'live2d');
      if (stagedHasLive2d) {
        expect(fs.readFileSync(path.join(live2dDir, 'old-model.txt'), 'utf8')).toBe('refreshed model');
      } else {
        expect(fs.readFileSync(path.join(live2dDir, 'old-model.txt'), 'utf8')).toBe('old model');
      }
      expect(fs.existsSync(`${target}.previous`)).toBe(false);
      expect(fs.existsSync(`${target}.new`)).toBe(false);
      expect(fs.readFileSync(path.join(directory, 'update-helper.log'), 'utf8')).toContain('mode=delta');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('delta helper rolls back to the previous bundle when launch fails', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-delta-test-'));
    const target = path.join(directory, 'Local Service Hub.app');
    const staged = path.join(directory, 'delta-root');
    const bin = path.join(directory, 'bin');
    try {
      fs.mkdirSync(path.join(target, 'Contents', 'MacOS'), { recursive: true });
      fs.writeFileSync(path.join(target, 'Contents', 'Info.plist'), 'old');
      fs.writeFileSync(path.join(target, 'Contents', 'MacOS', 'Local Service Hub'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const targetApp = path.join(target, 'Contents', 'Resources', 'app');
      fs.mkdirSync(path.join(targetApp, 'frontend', 'dist', 'live2d'), { recursive: true });
      fs.writeFileSync(path.join(targetApp, 'package.json'), '{"version":"2.0.3"}');
      fs.writeFileSync(path.join(targetApp, 'frontend', 'dist', 'live2d', 'old-model.txt'), 'old model');

      fs.mkdirSync(path.join(staged, 'Contents', 'Resources', 'app'), { recursive: true });
      fs.writeFileSync(path.join(staged, 'Contents', 'Info.plist'), 'new');
      fs.writeFileSync(path.join(staged, 'Contents', 'Resources', 'app', 'package.json'), '{"version":"2.0.4"}');

      writeStubBin(bin, {
        ditto: 'if [ -d "$2" ]; then /bin/cp -R "$1/." "$2/"; else /bin/cp -R "$1" "$2"; fi',
        open: 'exit 1',
        pgrep: 'exit 0',
        sleep: 'exit 0'
      });
      const child = spawnSync('/bin/bash', ['-s', '--', '2147483647', target, staged, directory, 'delta', 'false'], {
        input: loadTransport(jest.fn()).createHelperScript(), encoding: 'utf8', timeout: 10000,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` }
      });

      expect(child.status).toBe(1);
      expect(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8')).toBe('old');
      expect(fs.existsSync(path.join(target, 'Contents', 'Resources', 'app', 'frontend', 'dist', 'live2d', 'old-model.txt'))).toBe(true);
      expect(fs.existsSync(`${target}.previous`)).toBe(false);
      expect(fs.existsSync(`${target}.new`)).toBe(false);
      expect(fs.readFileSync(path.join(directory, 'update-helper.log'), 'utf8')).toContain('恢复旧版本');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
