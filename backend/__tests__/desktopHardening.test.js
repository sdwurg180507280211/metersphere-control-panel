const fs = require('fs');
const os = require('os');
const path = require('path');

const localAuthService = require('../services/localAuthService');
const privateFile = require('../utils/privateFile');
const { getTrustedRendererOrigins, isTrustedRendererUrl, hardenBrowserWindow } = require('../../electron-security');

function request({ method = 'POST', origin, host = '127.0.0.1:5001', remoteAddress = '127.0.0.1', fetchSite } = {}) {
  const headers = { host };
  if (origin !== undefined) headers.origin = origin;
  if (fetchSite !== undefined) headers['sec-fetch-site'] = fetchSite;
  return { method, headers, query: {}, socket: { remoteAddress } };
}

describe('Desktop localhost request security', () => {
  test('allows trusted localhost origins and CLI requests without Origin', () => {
    expect(localAuthService.verifyOrigin(request({ origin: 'http://127.0.0.1:5001' }))).toBe(true);
    expect(localAuthService.verifyOrigin(request({ origin: 'http://localhost:3001' }))).toBe(true);
    expect(localAuthService.verifyOrigin(request())).toBe(true);
  });

  test('rejects cross-site state-changing requests to loopback', () => {
    expect(localAuthService.verifyOrigin(request({ origin: 'https://evil.example' }))).toBe(false);
    expect(localAuthService.verifyOrigin(request({ origin: 'null' }))).toBe(false);
    expect(localAuthService.verifyOrigin(request({ fetchSite: 'cross-site' }))).toBe(false);
  });

  test('safe methods remain readable while remote requests still require a token', () => {
    expect(localAuthService.verifyOrigin(request({ method: 'GET', origin: 'https://evil.example' }))).toBe(true);
    expect(localAuthService.requiresToken(request({ remoteAddress: '192.168.1.20', host: '192.168.1.10:5001' }))).toBe(true);
  });

  test('recognizes IPv6 loopback Host headers', () => {
    expect(localAuthService.isLoopbackRequest(request({ host: '[::1]:5001', remoteAddress: '::1' }))).toBe(true);
  });
});

describe('Desktop renderer navigation security', () => {
  test('only trusts configured localhost renderer origins', () => {
    const origins = getTrustedRendererOrigins({ backendPort: 5001, startUrl: 'http://localhost:3001' });
    expect(isTrustedRendererUrl('http://localhost:5001/?view=hub', origins)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5001/?desktop=1', origins)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5001/#services', origins)).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:3001/', origins)).toBe(true);
    expect(isTrustedRendererUrl('https://example.com/', origins)).toBe(false);
  });

  test('blocks window.open, webviews and untrusted navigation', () => {
    const handlers = {};
    const webContents = {
      setWindowOpenHandler: jest.fn((handler) => { handlers.open = handler; }),
      on: jest.fn((event, handler) => { handlers[event] = handler; })
    };
    hardenBrowserWindow({ webContents }, { backendPort: 5001 });

    expect(handlers.open({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    const untrusted = { preventDefault: jest.fn() };
    handlers['will-navigate'](untrusted, 'https://example.com');
    expect(untrusted.preventDefault).toHaveBeenCalledTimes(1);
    const trusted = { preventDefault: jest.fn() };
    handlers['will-navigate'](trusted, 'http://localhost:5001/?view=hub');
    expect(trusted.preventDefault).not.toHaveBeenCalled();
    const webview = { preventDefault: jest.fn() };
    handlers['will-attach-webview'](webview);
    expect(webview.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('Project Hub workspace semantics', () => {
  test('uses project-level workspace IPC while preserving the legacy Hub URL alias', () => {
    const electronSource = fs.readFileSync(path.join(__dirname, '..', '..', 'electron.js'), 'utf8');
    const preloadSource = fs.readFileSync(path.join(__dirname, '..', '..', 'electron-preload.js'), 'utf8');
    const mainSource = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'main.jsx'), 'utf8');

    expect(electronSource).toContain("ipcMain.handle('project:open-workspace'");
    expect(electronSource).toContain("projectId !== 'metersphere'");
    expect(electronSource).toContain("url.searchParams.set('view', 'hub')");
    expect(electronSource).not.toContain('desktop:open-main');
    expect(preloadSource).toContain('openWorkspace: (projectId)');
    expect(preloadSource).not.toContain('openMainWindow');
    expect(mainSource).toContain("params.get('view') === 'hub' || params.get('desktop') === '1'");
  });
});

describe('Desktop private config file permissions', () => {
  test('writes and copies private files as owner-only on POSIX', () => {
    if (process.platform === 'win32') return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-private-file-'));
    try {
      const target = path.join(root, 'nested', 'config.json');
      const backup = `${target}.bak`;
      privateFile.writePrivateText(target, '{}\n');
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      privateFile.copyPrivateFile(target, backup);
      expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
      fs.chmodSync(target, 0o644);
      privateFile.secureFile(target);
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Desktop update task guard', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadGuard(activeJobs) {
    jest.doMock('../services/jobService', () => ({ getActiveJobs: jest.fn(async () => activeJobs) }));
    return require('../services/desktopUpdateGuardService');
  }

  test('blocks active package and frontend build jobs', async () => {
    const guard = loadGuard([
      { jobId: 'p1', type: 'package.run', status: 'running', stage: 'build' },
      { jobId: 'b1', type: 'frontend.build.batch', status: 'pending' },
      { jobId: 's1', type: 'service.start', status: 'running' }
    ]);
    await expect(guard.assertUpdateAllowed()).rejects.toMatchObject({ statusCode: 409, code: 'DESKTOP_UPDATE_TASKS_ACTIVE' });
  });

  test('does not block service lifecycle jobs or completed builds', async () => {
    const guard = loadGuard([
      { jobId: 's1', type: 'service.start', status: 'running' },
      { jobId: 'b1', type: 'frontend.build.batch', status: 'completed' }
    ]);
    await expect(guard.assertUpdateAllowed()).resolves.toBe(true);
  });
});
