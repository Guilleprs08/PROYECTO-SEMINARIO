// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// POST /login
// Queda como lo tienes: app.use('/login', router) -> POST /login
router.post('/', authController.login);

// POST /login/primer-cambio
// Endpoint para cambiar la contraseña en primer login (usa authController.cambiarPasswordPrimerLogin)
router.post('/primer-cambio', authController.cambiarPasswordPrimerLogin);

module.exports = router;
