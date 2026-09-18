const express = require('express');
const router = express.Router();
const { executeQuery, testConnection } = require('../services/sqlQueryService');
router.post('/query', async (req, res) => {
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', abort);
  res.once('close', abort);
  try {
    const { sql, limit } = req.body || {};
    if (typeof sql !== 'string' || !sql.trim()) return res.status(400).json({ success: false, error: '无效的 SQL 语句' });
    const result = await executeQuery(sql, 30000, limit || 1000, { signal: controller.signal });
    if (controller.signal.aborted || res.destroyed) return;
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed) res.status(error.statusCode || 500).json({ success: false, error: error.message || 'SQL 执行失败', code: error.code || 'SQL_EXECUTION_FAILED' });
  } finally {
    req.removeListener('aborted', abort); res.removeListener('close', abort);
  }
});
router.get('/status', async (req, res) => {
  try { const status = await testConnection(); res.status(status.connected ? 200 : 503).json(status); }
  catch (error) { res.status(503).json({ connected: false, readonlyVerified: false, error: error.message }); }
});
module.exports = router;
