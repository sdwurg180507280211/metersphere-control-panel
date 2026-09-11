const express = require('express');
const router = express.Router();
const meterSphereProjectController = require('../controllers/meterSphereProjectController');

router.get('/', meterSphereProjectController.get);
router.put('/', meterSphereProjectController.save);

module.exports = router;
