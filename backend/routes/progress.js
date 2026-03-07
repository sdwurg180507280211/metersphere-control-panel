/**
 * 构建进度路由
 */
const express = require('express');
const router = express.Router();
const buildProgressService = require('../services/buildProgressService');
const processManager = require('../services/processManager');

router.get('/active', async (req, res) => {
  try {
    const builds = buildProgressService.getActiveBuilds();
    res.json({ success: true, data: builds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/history/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const history = await buildProgressService.getRecentBuilds(limit);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:buildId', async (req, res) => {
  try {
    const build = await buildProgressService.getBuild(req.params.buildId);
    if (!build) {
      return res.status(404).json({ success: false, error: '构建任务不存在' });
    }
    res.json({ success: true, data: build });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:buildId/cancel', async (req, res) => {
  try {
    const result = await processManager.cancelBuild(req.params.buildId);
    if (result) {
      res.json({ success: true, message: '构建已取消' });
    } else {
      res.status(404).json({ success: false, error: '构建任务不存在或已完成' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
