const express = require('express');
const configController = require('../controllers/configController');

const router = express.Router();

router.get('/', configController.getConfig);
router.post('/validate-path', configController.validatePath);
router.post('/validate', configController.validate);
router.put('/', configController.save);
router.post('/apply', configController.apply);
router.post('/scan', configController.scanProject);
router.get('/diagnostics', configController.refreshDiagnostics);
router.post('/test-redis', configController.testRedis);
router.get('/properties/:filename', configController.getProperties);
router.put('/properties/:filename', configController.saveProperties);
router.post('/properties/:filename/sudo-read', configController.getPropertiesWithSudo);
router.post('/properties/:filename/sudo-write', configController.savePropertiesWithSudo);

module.exports = router;
