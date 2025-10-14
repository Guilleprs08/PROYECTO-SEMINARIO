const express = require('express');
const router = express.Router();
const calculoProductoController = require('../controllers/calculo-producto.controller');

router.get('/', calculoProductoController.getCalculosProductos);

module.exports = router;
