const express = require("express");
const router = express.Router();
const registrarCierreController = require("../../controllers/caja/registrarCierre.controller");

// 🔹 Endpoint para registrar el cierre de caja
router.post("/", async (req, res, next) => {
  try {
    await registrarCierreController.registrarCierreCaja(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
