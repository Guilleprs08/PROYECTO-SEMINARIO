const express = require('express');
const estadosProductosController = require('../controllers/estados-productos.controller');

const router = express.Router();

// 📌 GET /api/estados-productos
router.get('/', estadosProductosController.listarEstadosProductos);

module.exports = router;
