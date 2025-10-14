const express = require('express');
const router = express.Router();
const tipoCambioController = require('../controllers/tipocambio.controller');

// Público; sin autenticación
router.get('/hoy', tipoCambioController.getHoy);

module.exports = router;
