// src/routes/recuperarcontrasena/recuperarContrasena.routes.js
const express = require('express');
const router = express.Router();

const recupCtrl = require('../../controllers/recuperacioncontrasena/recuperarContrasena.controller');

// /password/forgot  → iniciar flujo (genera código)
router.post('/forgot', recupCtrl.recuperarContrasena);

// /password/resend  → reenvía código (mismo flujo ACTIVO)
router.post('/resend', recupCtrl.reenviarCodigo);

// /password/reset   → valida código y cambia contraseña
router.post('/reset', recupCtrl.resetContrasena);

module.exports = router;
