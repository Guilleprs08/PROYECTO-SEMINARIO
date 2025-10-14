// backend-movieflow/src/routes/inventario/productoPorLote.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../../controllers/inventario/productoPorLote.controller');
const sanitize = require('../../middlewares/sanitize.middleware');

// GET /api/producto-por-lote?productoId=4
router.get('/', sanitize, ctrl.listarPorProducto);

// PUT /api/producto-por-lote/:idPorLote
router.put('/:idPorLote', sanitize, ctrl.actualizarPorLote);

module.exports = router;
