const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');

router.get('/active', jobController.getActiveJobs);
router.get('/history/recent', jobController.getRecentJobs);
router.get('/:jobId', jobController.getJob);
router.post('/:jobId/cancel', jobController.cancelJob);

module.exports = router;
