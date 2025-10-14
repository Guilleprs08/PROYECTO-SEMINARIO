// src/routes/cliente.routes.js
const { Router } = require('express');
const router = Router();

const ctrl = require('../controllers/cliente.controller');
const { verificarTokenCliente } = require('../middlewares/authCliente');

// Listados
router.get('/cliente/cartelera', ctrl.getCartelera);
router.get('/cliente/cartelera/:peliculaId/funciones', ctrl.getFuncionesByPelicula);
router.get('/cliente/funciones/:funcionId/asientos', ctrl.getAsientosByFuncion);

// Acciones
router.post('/cliente/funciones/:funcionId/pagar', verificarTokenCliente, ctrl.postPagar);
router.post('/cliente/funciones/:funcionId/reservar', verificarTokenCliente, ctrl.postReservar);
router.post('/cliente/funciones/:funcionId/liberar-reservas-vencidas', ctrl.postLiberarReservasVencidas);

// Diagnóstico del token
router.get('/cliente/debug/whoami', verificarTokenCliente, (req, res) => {
  res.json({ ok: true, cliente: req.cliente || null });
});

module.exports = router;
