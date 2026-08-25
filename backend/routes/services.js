/**
 * 服务路由
 */
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const desktopAppController = require('../controllers/desktopAppController');

// 服务目录与状态
router.get('/catalog', serviceController.getCatalog);
router.get('/status', serviceController.getAllStatus);

// Desktop 小窗口本地应用：只执行 config.json 中已保存的启动/关闭命令。
router.get('/desktop-apps/catalog', desktopAppController.getCatalog);
router.get('/desktop-apps/status', desktopAppController.getAllStatus);
router.post('/desktop-apps', desktopAppController.save);
router.delete('/desktop-apps/:id', desktopAppController.remove);
router.post('/desktop-apps/:id/start', desktopAppController.start);
router.post('/desktop-apps/:id/stop', desktopAppController.stop);

// 基础设施状态
router.get('/infra/status', serviceController.getInfraStatus);

// SDK 构建
router.post('/build/sdk', serviceController.buildSdk);

// 批量操作
router.post('/start-all', serviceController.startAll);
router.post('/stop-all', serviceController.stopAll);
router.post('/restart-all', serviceController.restartAll);

// 系统命令
router.post('/system/reload', serviceController.systemReload);

// SSH 隧道
router.post('/tunnel/start', serviceController.tunnelStart);
router.post('/tunnel/stop', serviceController.tunnelStop);
router.get('/tunnel/status', serviceController.tunnelStatus);
router.get('/tunnel/config', serviceController.getTunnelConfig);
router.post('/tunnel/config', serviceController.saveTunnelConfig);

// 单个 MeterSphere 服务操作
router.get('/:id/status', serviceController.getStatus);
router.get('/:id/health', serviceController.healthCheck);
router.post('/:id/start', serviceController.start);
router.post('/:id/stop', serviceController.stop);
router.post('/:id/restart', serviceController.restart);
router.post('/:id/reload', serviceController.reload);

module.exports = router;
