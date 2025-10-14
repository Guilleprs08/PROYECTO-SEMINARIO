const express = require('express');
const router = express.Router();
const estadosController = require('../controllers/estados.controller');

router.get('/', estadosController.getEstados);

module.exports = router;
