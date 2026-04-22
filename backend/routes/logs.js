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

// 获取按级别分类的日志文件列表
router.get('/files/by-level', logController.getFilesByLevel);

// 读取指定服务的错误/警告/命令日志
router.get('/service', logController.readServiceLogs);

// 获取命令历史
router.get('/commands', logController.getCommandHistory);

// 下载指定服务的错误/警告日志
router.get('/service/download', logController.downloadServiceLogs);

// 清理旧日志
router.post('/clean', logController.clean);

module.exports = router;
