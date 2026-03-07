/**
 * 日志路由
 */
const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');

// SSE 日志流
router.get('/stream', logController.stream);

// 获取日志文件列表
router.get('/files', logController.getFiles);

// 清理旧日志
router.post('/clean', logController.clean);

module.exports = router;
