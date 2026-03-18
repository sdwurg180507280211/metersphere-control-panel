/**
 * 构建路由
 */
const express = require('express');
const router = express.Router();
const buildController = require('../controllers/buildController');

// 获取模块列表
router.get('/modules', buildController.getModules);

// 构建单个模块
router.post('/frontend', buildController.build);

// 批量构建
router.post('/frontend/batch', buildController.buildBatch);

// 启动前端开发服务器
router.post('/dev-server/start', buildController.startDevServer);

// 停止前端开发服务器
router.post('/dev-server/stop', buildController.stopDevServer);

// 获取前端开发服务器状态
router.get('/dev-server/status', buildController.getDevServerStatus);

module.exports = router;
