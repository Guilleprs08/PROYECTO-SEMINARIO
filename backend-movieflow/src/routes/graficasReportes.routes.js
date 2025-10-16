// src/routes/graficasReportes.routes.js
const { Router } = require('express');

// 👇 actualizar ruta al controlador (carpeta sin "s")
const R = require('../controllers/graficas_reportes/ReportesdeSalas.controllers.js');

const router = Router();

router.get('/kpis-salas', R.getKPIsSalas);
router.get('/ocupacion-por-sala-hoy', R.getOcupacionPorSalaHoy);
router.get('/tendencia-semanal', R.getTendenciaSemanal);
router.get('/detalle-ocupacion', R.getDetalleOcupacion);
router.get('/ingresos-por-sala-hoy', R.getIngresosPorSalaHoy);
router.get('/kpis/sala/:salaId', R.getKPIsDeSala);


module.exports = router;
