const express = require('express');
const configController = require('../controllers/configController');

const router = express.Router();

router.get('/', configController.getConfig);
router.post('/validate', configController.validate);
router.put('/', configController.save);
router.post('/apply', configController.apply);
router.get('/diagnostics', configController.refreshDiagnostics);

module.exports = router;
