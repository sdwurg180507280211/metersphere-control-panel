const localAuthService = require('../services/localAuthService');
const { createAppError, sendError } = require('../utils/errors');

function localAuth(req, res, next) {
  if (req.path === '/health') {
    return next();
  }

  if (!localAuthService.verifyRequest(req)) {
    return sendError(res, createAppError(401, 'UNAUTHORIZED', '本地访问令牌无效或缺失'));
  }

  return next();
}

module.exports = localAuth;
