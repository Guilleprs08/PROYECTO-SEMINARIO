// src/routes/caja/CierredelasCajas.routes.js
const express = require("express");
const router = express.Router();
const CierredelasCajasController = require("../../controllers/caja/CierredelasCajas.controller");

// 📌 Listar todas las cajas abiertas de un usuario
router.get("/cajas-abiertas", CierredelasCajasController.getCajasAbiertas);

// 📌 Obtener información detallada de cierre de una caja seleccionada
router.get("/info", CierredelasCajasController.getInfoCierreCaja);

module.exports = router;
