// routes/ventas/estadoVenta.routes.js
const express = require("express");
const router = express.Router();
const estadoVentaController = require("../../controllers/ventas/estadoVenta.controller");
const sanitize = require("../../middlewares/sanitize.middleware");

// GET → obtener todos los estados de venta
router.get("/", sanitize, estadoVentaController.listarEstadosVenta);

module.exports = router;
