function getTrustedRendererOrigins({ backendPort, startUrl } = {}) {
  const origins = new Set();
  const candidates = [
    startUrl,
    backendPort ? `http://localhost:${backendPort}` : null,
    backendPort ? `http://127.0.0.1:${backendPort}` : null
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const target = new URL(candidate);
      if ((target.protocol === 'http:' || target.protocol === 'https:')
        && (target.hostname === 'localhost' || target.hostname === '127.0.0.1')) {
        origins.add(target.origin);
      }
    } catch {
      // 非法地址不进入 renderer 白名单。
    }
  }

  return origins;
}

function isTrustedRendererUrl(rawUrl, trustedOrigins) {
  try {
    return trustedOrigins.has(new URL(rawUrl).origin);
  } catch {
    return false;
  }
}

function hardenBrowserWindow(window, options = {}) {
  const trustedOrigins = getTrustedRendererOrigins(options);

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const blockUntrustedNavigation = (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl, trustedOrigins)) {
      event.preventDefault();
    }
  };

  window.webContents.on('will-navigate', blockUntrustedNavigation);
  window.webContents.on('will-redirect', blockUntrustedNavigation);
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

module.exports = {
  getTrustedRendererOrigins,
  isTrustedRendererUrl,
  hardenBrowserWindow
};
