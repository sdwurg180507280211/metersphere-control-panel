function createAppError(statusCode, code, message, details = {}, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.headers = extra.headers || {};
  return error;
}

function normalizeError(error, fallback = {}) {
  const normalized = error instanceof Error ? error : Object.assign(new Error(error?.message || fallback.message || '服务器内部错误'), error || {});

  return {
    statusCode: normalized.statusCode || fallback.statusCode || 500,
    code: normalized.code || fallback.code || 'INTERNAL_ERROR',
    message: normalized.message || fallback.message || '服务器内部错误',
    details: normalized.details || fallback.details || {},
    headers: normalized.headers || fallback.headers || {}
  };
}

function sendError(res, error, fallback = {}) {
  const normalized = normalizeError(error, fallback);

  Object.entries(normalized.headers).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      res.setHeader(key, String(value));
    }
  });

  return res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details
    }
  });
}

module.exports = {
  createAppError,
  normalizeError,
  sendError
};
