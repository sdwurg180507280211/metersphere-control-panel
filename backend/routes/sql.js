const express = require('express');
const router = express.Router();
const { executeQuery, testConnection } = require('../services/sqlQueryService');

router.post('/query', async (req, res) => {
  try {
    const { sql, limit } = req.body || {};

    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, error: '无效的 SQL 语句' });
    }

    const result = await executeQuery(sql, 30000, limit || 1000);
    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'SQL 执行失败',
      code: error.code || 'SQL_EXECUTION_FAILED'
    });
  }
});

router.get('/status', async (req, res) => {
  const status = await testConnection();
  res.status(status.connected ? 200 : 503).json(status);
});

module.exports = router;
