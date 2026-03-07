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

module.exports = router;
