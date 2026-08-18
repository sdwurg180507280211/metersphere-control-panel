const express = require('express');
const packageController = require('../controllers/packageController');

const router = express.Router();

router.get('/options', packageController.getOptions);
router.get('/active', packageController.getActive);
router.post('/run', packageController.run);
router.post('/cancel', packageController.cancel);
router.get('/history', packageController.getHistory);
router.get('/history/:id', packageController.getHistoryById);
router.put('/history/:id/changelog', packageController.updateChangelog);

module.exports = router;
