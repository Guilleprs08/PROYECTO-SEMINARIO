const { Router } = require("express");

// Controlador Excel de Reportes de Sala
const Ctrl = require("../../controllers/excel/reportesDeSala.controller");

const router = Router();

// Exportar a Excel (con imágenes de las gráficas)
router.post("/reportes-de-sala", Ctrl.generarReportesDeSalaExcel);

module.exports = router;
