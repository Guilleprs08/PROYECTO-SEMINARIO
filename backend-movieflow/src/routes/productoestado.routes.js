const express = require('express');
const router = express.Router();
const productoEstadoCtrl = require('../controllers/productoestado.controller');

// 🔹 Listar todos los estados únicos en el sistema (como catálogo)
router.get('/', productoEstadoCtrl.listarEstadosProducto);

// 🔹 Listar los estados dinámicos de un producto específico
router.get('/:id', productoEstadoCtrl.listarEstadosPorProducto);

// 🔹 Listar productos que tienen un estado dinámico específico
router.get('/filtro/:estado', productoEstadoCtrl.listarProductosPorEstado);

module.exports = router;
