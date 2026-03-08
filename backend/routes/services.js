/**
 * 服务路由
 */
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

// 服务目录与状态
router.get('/catalog', serviceController.getCatalog);
router.get('/status', serviceController.getAllStatus);

// 批量操作
router.post('/start-all', serviceController.startAll);
router.post('/stop-all', serviceController.stopAll);
router.post('/restart-all', serviceController.restartAll);

// 单个服务操作
router.get('/:id/status', serviceController.getStatus);
router.get('/:id/health', serviceController.healthCheck);
router.post('/:id/start', serviceController.start);
router.post('/:id/stop', serviceController.stop);
router.post('/:id/restart', serviceController.restart);
router.post('/:id/reload', serviceController.reload);

module.exports = router;
