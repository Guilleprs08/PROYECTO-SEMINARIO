// backend-movieflow/src/routes/pedidosSnacks.routes.js
const express = require('express');
const pedidosCtrl = require('../controllers/pedidosSnacks.controller');

const router = express.Router();

// Cliente
router.get('/funciones-activas', pedidosCtrl.listarFuncionesActivasAhora);
router.post('/', pedidosCtrl.crearPedido);
router.get('/mis', pedidosCtrl.listarMisPedidos);
router.get('/:id/pdf', pedidosCtrl.generarComprobantePDF);

// Empleado
router.get('/por-funcion/:funcionId', pedidosCtrl.listarPorFuncion);
router.patch('/:id/estado', pedidosCtrl.actualizarEstado);

// Catálogo
router.get('/catalogo/productos', pedidosCtrl.listarProductos);
router.get('/catalogo/combos', pedidosCtrl.listarCombos);

// ✅ Resumen para el dashboard (queda en /api/pedidos-snacks/ventas-resumen)
router.get('/ventas-resumen', pedidosCtrl.resumenVentas);

module.exports = router;
