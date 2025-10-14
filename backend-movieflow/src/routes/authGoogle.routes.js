const express = require("express");
const router = express.Router();
const { autenticarConGoogle } = require("../controllers/authGoogle.controller");
const { verificarTokenCliente } = require("../middlewares/authCliente");

// 📌 Login con Google
router.post("/google", autenticarConGoogle);

// 📌 Ruta de prueba protegida
router.get("/protegida", verificarTokenCliente, (req, res) => {
  return res.json({
    success: true,
    message: `Hola ${req.cliente.name}, tu token es válido.`,
    cliente: req.cliente
  });
});

module.exports = router;
