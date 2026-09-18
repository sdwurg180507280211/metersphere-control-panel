const express = require('express');
const router = express.Router();
const meterSphereProjectController = require('../controllers/meterSphereProjectController');
const workspaceController = require('../controllers/workspaceController');

router.get('/', meterSphereProjectController.get);
router.get('/workspace', workspaceController.getSnapshot);
router.put('/', meterSphereProjectController.save);

module.exports = router;
