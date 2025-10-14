const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/actualizar-producto.controller');

/** Helper: toma el primer handler existente entre varios alias sin tumbar el server */
function pickHandler(...names) {
  for (const n of names) {
    const fn = ctrl?.[n] || ctrl?.default?.[n];
    if (typeof fn === 'function') return fn;
  }
  return (_req, res) =>
    res.status(500).json({ error: 'Handler faltante en actualizar-producto.controller', expected: names });
}

/* --------- Unificado --------- */
// 🔍 Buscar por nombre (?q=...)
router.get('/buscar', pickHandler('buscarProductoPorNombre', 'buscar', 'search'));

// 📌 Obtener producto por ID
router.get('/:id', pickHandler('obtenerProductoPorId', 'getById', 'findById'));

// ✏️ Actualizar por ID (dinámico)
router.put('/:id', pickHandler('actualizarProducto', 'update', 'updateProducto'));

// 🗑 Eliminar por ID
router.delete('/:id', pickHandler('eliminarProducto', 'remove', 'delete'));
/* ----------------------------- */

module.exports = router;
