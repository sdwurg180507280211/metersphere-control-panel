const crypto = require('crypto');

const TOKEN = process.env.MS_LOCAL_TOKEN || crypto.randomBytes(24).toString('hex');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
let rendererOrigins = new Set();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function getToken() { return TOKEN; }
function extractToken(req) {
  const header = req.headers?.['x-ms-local-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers?.authorization;
  const bearer = typeof auth === 'string' && auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  if (typeof req.query?.token === 'string') return req.query.token.trim();
  try { return new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('token') || ''; }
  catch { return ''; }
}
function verifyToken(token) { return safeEqual(token, TOKEN); }
function normalizeIp(value = '') {
  return String(value).replace(/^::ffff:/, '').replace(/^\[|\]$/g, '');
}
function isLoopbackAddress(value = '') {
  return ['127.0.0.1', '::1', 'localhost'].includes(normalizeIp(value));
}
function getHostName(host = '') {
  try { return normalizeIp(new URL(`http://${host}`).hostname); }
  catch { return ''; }
}
function isLoopbackRequest(req) {
  const address = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const host = getHostName(req.headers?.host);
  // A missing/invalid Host must not open the loopback exception.
  return isLoopbackAddress(address) && isLoopbackAddress(host);
}
function localOrigin(value) {
  try {
    const target = new URL(String(value));
    if (!['http:', 'https:'].includes(target.protocol) || !isLoopbackAddress(target.hostname)
      || target.username || target.password || target.pathname !== '/' || target.search || target.hash) return null;
    return target.origin;
  } catch { return null; }
}
function configureOrigins({ port, origins = [] } = {}) {
  const next = new Set();
  const number = Number(port);
  if (Number.isInteger(number) && number > 0 && number <= 65535) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) next.add(new URL(`http://${host}:${number}`).origin);
  }
  for (const value of origins) {
    const origin = localOrigin(value);
    if (!origin) throw new Error('只允许显式配置的本机 HTTP(S) Renderer Origin');
    next.add(origin);
  }
  rendererOrigins = next;
}
function isTrustedLocalOrigin(origin, req) {
  const normalized = localOrigin(origin);
  if (!normalized) return false;
  if (rendererOrigins.has(normalized)) return true;
  // Exact same-origin fallback for CLI/web mode, including tests before listen().
  if (!req || !isLoopbackRequest(req)) return false;
  const scheme = req.socket?.encrypted ? 'https:' : 'http:';
  try { return normalized === new URL(`${scheme}//${req.headers.host}`).origin; }
  catch { return false; }
}
function verifyOrigin(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  const origin = req.headers?.origin;
  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
  if (origin == null || origin === '') {
    // Non-browser clients still pass through verifyRequest().
    return true;
  }
  return isTrustedLocalOrigin(origin, req);
}
function requiresToken(req) {
  return ['1', 'true'].includes(process.env.MS_REQUIRE_LOCAL_TOKEN) || !isLoopbackRequest(req);
}
function verifyRequest(req) { return !requiresToken(req) || verifyToken(extractToken(req)); }
function verifyWebSocketRequest(req) {
  // Upgrade is GET, so verifyOrigin() alone deliberately does NOT suffice.
  const origin = req.headers?.origin;
  if (origin != null && origin !== '') {
    if (!isTrustedLocalOrigin(origin, req)) return false;
    if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return false;
    return verifyRequest(req);
  }
  // Native WebSocket/CLI clients without Origin must prove possession of a token.
  return verifyToken(extractToken(req));
}
module.exports = {
  getToken, extractToken, verifyToken, verifyRequest, verifyOrigin, requiresToken,
  isLoopbackRequest, isTrustedLocalOrigin, configureOrigins, verifyWebSocketRequest
};
