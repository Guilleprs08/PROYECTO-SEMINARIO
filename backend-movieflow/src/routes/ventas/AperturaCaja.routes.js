const express = require("express");
const router = express.Router();
const AperturaCajaController = require("../../controllers/ventas/AperturaCaja.controller");

// Obtener denominaciones (solo valores)
router.get("/denominaciones", AperturaCajaController.listarDenominaciones);

// Aperturar caja
router.post("/apertura", AperturaCajaController.abrirCaja);

module.exports = router;
    