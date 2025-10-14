const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Cambia la ruta POST a '/' para que quede POST /login en conjunto con app.use('/login', ...)
router.post('/', authController.login);

module.exports = router;
