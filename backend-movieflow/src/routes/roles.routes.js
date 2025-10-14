const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/roles.controller');
const nuevoRolController = require('../controllers/asignacionderoles.controller'); 

// Obtener roles existentes
router.get('/', rolesController.getRoles);

// Crear nuevo rol
router.post('/', nuevoRolController.crearRol); // ✅ nuevo endpoint

module.exports = router;
