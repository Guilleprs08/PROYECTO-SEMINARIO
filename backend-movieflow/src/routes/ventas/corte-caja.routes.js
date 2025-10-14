// src/routes/ventas/corte-caja.routes.js
const express = require("express");
const router = express.Router();

// ⛳ IMPORTA BIEN el controller (respeta el nombre del archivo)
const corteCajaCtrl = require("../../controllers/ventas/corteCaja.controller");

// Endpoints
router.get("/filtros", corteCajaCtrl.obtenerFiltros);
router.get("/rangos", corteCajaCtrl.obtenerRangosFecha);
router.get("/resumen", corteCajaCtrl.obtenerResumen);

module.exports = router;
