// src/routes/reportes.routes.js
const { Router } = require('express');
const { getVentasSnacks } = require('../controllers/graficas_reportes/ventasSnacks.controller');

const router = Router();

// GET /api/reportes/ventas-snacks?desde=01/10/2025&hasta=31/10/2025
router.get('/reportes/ventas-snacks', getVentasSnacks);

module.exports = router;
