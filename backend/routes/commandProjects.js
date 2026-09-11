const express = require('express');
const router = express.Router();
const commandProjectController = require('../controllers/commandProjectController');

router.get('/', commandProjectController.getCatalog);
router.post('/', commandProjectController.save);
router.get('/status', commandProjectController.getAllStatus);
router.post('/:id/start', commandProjectController.start);
router.post('/:id/stop', commandProjectController.stop);
router.delete('/:id', commandProjectController.remove);

module.exports = router;
