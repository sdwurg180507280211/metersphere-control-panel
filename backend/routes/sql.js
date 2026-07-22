const express = require('express');
const router = express.Router();
const { executeQuery, testConnection } = require('../services/sqlQueryService');
const { createAppError, sendError } = require('../utils/errors');

router.post('/query', async (req, res) => {
  try {
    const { sql, limit } = req.body || {};

    if (!sql || typeof sql !== 'string') {
      return sendError(res, createAppError(400, 'INVALID_SQL', '无效的 SQL 语句'));
    }

    const result = await executeQuery(sql, 30000, limit || 1000);
    if (!result.success) {
      return sendError(res, createAppError(500, result.code || 'SQL_EXECUTION_FAILED', result.error || 'SQL 执行失败'));
    }

    return res.json(result);
  } catch (error) {
    return sendError(res, error, {
      statusCode: 500,
      code: 'SQL_EXECUTION_FAILED',
      message: 'SQL 执行失败'
    });
  }
});

router.get('/status', async (req, res) => {
  const status = await testConnection();
  res.status(status.connected ? 200 : 503).json(status);
});

module.exports = router;
