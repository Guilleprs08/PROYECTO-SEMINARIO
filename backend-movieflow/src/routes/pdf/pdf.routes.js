// src/routes/pdf/pdf.routes.js
const { Router } = require('express');
// ❌ estaba: '../controllers/pdf/reportesDeSala.controller'
const { generarReporteSalasPDF } = require('../../controllers/pdf/reportesDeSala.controller');

const router = Router();
router.post('/reportes-de-sala', generarReporteSalasPDF);
module.exports = router;
