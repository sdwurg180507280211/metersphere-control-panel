const crypto = require('crypto');

const TOKEN = process.env.MS_LOCAL_TOKEN || crypto.randomBytes(24).toString('hex');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function getToken() {
  return TOKEN;
}

function extractToken(req) {
  const headerToken = req.headers['x-ms-local-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string') {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }

  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }

  return '';
}

function verifyToken(token) {
  return safeEqual(token, TOKEN);
}

function normalizeIp(value = '') {
  return String(value)
    .replace(/^::ffff:/, '')
    .replace(/^\[|\]$/g, '');
}

function isLoopbackAddress(value = '') {
  const ip = normalizeIp(value);
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function getHostName(hostHeader = '') {
  const value = String(hostHeader || '').trim();
  if (!value) return '';
  try {
    return normalizeIp(new URL(`http://${value}`).hostname);
  } catch {
    return normalizeIp(value.replace(/:\d+$/, ''));
  }
}

function isLoopbackRequest(req) {
  const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const host = getHostName(req.headers.host);
  return isLoopbackAddress(remoteAddress) && (!host || isLoopbackAddress(host));
}

function isTrustedLocalOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value || value === 'null') return false;
  try {
    const target = new URL(value);
    return (target.protocol === 'http:' || target.protocol === 'https:')
      && isLoopbackAddress(target.hostname);
  } catch {
    return false;
  }
}

function verifyOrigin(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method) || !isLoopbackRequest(req)) {
    return true;
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return false;
  }

  const origin = req.headers.origin;
  if (origin === undefined || origin === null || String(origin).trim() === '') {
    // curl/CLI/本地脚本通常没有 Origin；loopback 限制仍然成立。
    return true;
  }

  return isTrustedLocalOrigin(origin);
}

function requiresToken(req) {
  if (process.env.MS_REQUIRE_LOCAL_TOKEN === '1' || process.env.MS_REQUIRE_LOCAL_TOKEN === 'true') {
    return true;
  }
  return !isLoopbackRequest(req);
}

function verifyRequest(req) {
  if (!requiresToken(req)) {
    return true;
  }
  return verifyToken(extractToken(req));
}

module.exports = {
  getToken,
  extractToken,
  verifyToken,
  verifyRequest,
  verifyOrigin,
  requiresToken,
  isLoopbackRequest,
  isTrustedLocalOrigin
};
