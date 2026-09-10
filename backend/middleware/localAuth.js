const localAuthService = require('../services/localAuthService');
const { createAppError, sendError } = require('../utils/errors');

function localAuth(req, res, next) {
  if (req.path === '/health') {
    return next();
  }

  if (!localAuthService.verifyOrigin(req)) {
    return sendError(res, createAppError(403, 'FORBIDDEN_ORIGIN', '拒绝来自非本机页面的跨站请求'));
  }

  if (!localAuthService.verifyRequest(req)) {
    return sendError(res, createAppError(401, 'UNAUTHORIZED', '本地访问令牌无效或缺失'));
  }

  return next();
}

module.exports = localAuth;
