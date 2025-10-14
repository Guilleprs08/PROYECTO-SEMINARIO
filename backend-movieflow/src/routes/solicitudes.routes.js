// src/routes/solicitudes.routes.js
const express = require('express');
const ctrl = require('../controllers/solicitudes.controller');

const router = express.Router();

/* ======================== Cliente ======================== */
// Crear una nueva solicitud
router.post('/', ctrl.crearSolicitud);

// Listar “mis solicitudes” (filtra por CLIENTE_ID o email dentro de NOTAS)
router.get('/mis', ctrl.misSolicitudes);

// Alias por compatibilidad si en algún lugar se usó /mias
router.get('/mias', ctrl.misSolicitudes);

/* ========================= Admin ========================= */
// Listado general (permite ?estado=PENDIENTE|ACEPTADA|RECHAZADA)
router.get('/', ctrl.listarSolicitudes);

// Aprobar (crea evento oficial y marca la solicitud como ACEPTADA)
router.patch('/:id/aprobar', ctrl.aprobarSolicitud);

// Rechazar (requiere motivo; guarda MOTIVO_RECHAZO)
router.patch('/:id/rechazar', ctrl.rechazarSolicitud);

module.exports = router;
