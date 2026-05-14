const crypto = require('crypto');

const TOKEN = process.env.MS_LOCAL_TOKEN || crypto.randomBytes(24).toString('hex');

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

function isLoopbackRequest(req) {
  const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const host = String(req.headers.host || '').split(':')[0];
  return isLoopbackAddress(remoteAddress) && (!host || isLoopbackAddress(host));
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
  requiresToken,
  isLoopbackRequest
};
