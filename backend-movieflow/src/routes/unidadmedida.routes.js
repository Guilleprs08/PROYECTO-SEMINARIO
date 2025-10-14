// backend-movieflow/src/routes/unidadmedida.routes.js
const express = require('express');
const router = express.Router();

const unidadMedidaController = require('../controllers/unidadmedida.controller');

// 📋 Listar todas las unidades de medida
router.get('/', unidadMedidaController.listarUnidadesMedida);

// 🔍 Buscar unidades de medida ?q=...
router.get('/buscar', unidadMedidaController.buscarUnidadMedida);

// ➕ Guardar varias unidades de medida en lote
router.post('/lote', unidadMedidaController.agregarUnidadesMedidaLote);

// 🗑 Eliminar unidad de medida por código
router.delete('/:codigo', unidadMedidaController.eliminarUnidadMedida);

module.exports = router;
