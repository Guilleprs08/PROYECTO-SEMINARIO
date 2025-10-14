const express = require('express');
const { body } = require('express-validator');
const categoriasController = require('../controllers/categoriaproductos.controller'); // ✅ corregido

const router = express.Router();

// 📌 Guardar varias categorías en lote
router.post(
  '/lote',
  [
    body('categorias')
      .isArray({ min: 1 }).withMessage('Debe enviar al menos una categoría'),
    body('categorias.*.nombre')
      .trim()
      .notEmpty().withMessage('El nombre es obligatorio')
      .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
  ],
  categoriasController.agregarCategoriasLote
);

// 📌 Buscar categorías
router.get('/buscar', categoriasController.buscarCategorias);

// 📌 Listar todas las categorías
router.get('/', categoriasController.listarCategorias);

// 📌 Eliminar categoría
router.delete('/:codigo', categoriasController.eliminarCategoria);

module.exports = router;
