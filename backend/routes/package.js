const express = require('express');
const packageController = require('../controllers/packageController');

const router = express.Router();

router.get('/options', packageController.getOptions);
router.get('/active', packageController.getActive);
router.post('/run', packageController.run);

module.exports = router;
