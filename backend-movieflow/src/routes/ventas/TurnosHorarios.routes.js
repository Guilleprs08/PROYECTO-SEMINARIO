const express = require("express");
const router = express.Router();
const TurnosHorariosController = require("../../controllers/ventas/TurnosHorarios.controller");

// Rutas
router.get("/cajas", TurnosHorariosController.listarCajas);
router.get("/turnos", TurnosHorariosController.listarTurnos);

module.exports = router;
