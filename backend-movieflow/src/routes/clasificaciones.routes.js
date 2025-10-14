// src/routes/clasificaciones.routes.js
const express = require('express');
const router = express.Router();

const {
  getClasificaciones,
  createClasificacion
} = require('../controllers/clasificacion.controller');

// 📌 GET /api/clasificaciones  → Listar clasificaciones
router.get('/', getClasificaciones);

// 📌 POST /api/clasificaciones → Crear nueva clasificación
router.post('/', createClasificacion);

module.exports = router;
