// backend-movieflow/src/routes/pdf/inicioaperturaCaja.routes.js
const express = require("express");
const router = express.Router();

// Controladores
const aperturaCajaPDFController = require("../../controllers/pdf/inicioaperturaCaja.controller");
const corteCajaPDFController = require("../../controllers/pdf/corteCaja.controller");

//
// 🔹 Rutas principales de PDF (Apertura y Corte de Caja)
// Se montarán bajo /api/pdf en server.js
//
router.get("/apertura-caja/:id_apertura", aperturaCajaPDFController.generarAperturaCajaPDF);
router.get("/corte-caja/:id_cierre", corteCajaPDFController.generarCorteCajaPDF);

//
// 🔹 (Opcional) Compatibilidad con rutas antiguas
// Dejar al final para evitar conflictos con las rutas anteriores
//
// router.get("/:id_apertura", aperturaCajaPDFController.generarAperturaCajaPDF);

module.exports = router;
