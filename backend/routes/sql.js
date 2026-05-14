const express = require('express');
const router = express.Router();
const { executeQuery, testConnection } = require('../services/sqlQueryService');

router.post('/query', async (req, res) => {
  const { sql, limit } = req.body;

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: '无效的 SQL 查询' });
  }

  const result = await executeQuery(sql, 30000, limit || 1000);

  if (result.success) {
    res.json(result);
  } else {
    res.status(result.readonlyViolation ? 400 : 500).json(result);
  }
});

router.get('/status', async (req, res) => {
  const status = await testConnection();
  res.json(status);
});

module.exports = router;
