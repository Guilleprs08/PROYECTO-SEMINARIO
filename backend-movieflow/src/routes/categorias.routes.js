const express = require('express');
const router = express.Router();
const categoriaController = require('../controllers/categoria.controller');

// Obtener todas las categorías
router.get('/categorias', categoriaController.getCategorias);

// Crear nueva categoría
router.post('/categorias', categoriaController.createCategoria);

module.exports = router;
