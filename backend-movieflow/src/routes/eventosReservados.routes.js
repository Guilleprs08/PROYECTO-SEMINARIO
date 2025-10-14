const { Router } = require('express');
const controller = require('../controllers/eventosReservados.controller');

// Prefijo ya se aplica en server.js: app.use('/api/eventos-reservados', router)
const router = Router();

/** Slots y disponibilidad */
router.get('/slots', controller.obtenerSlots);
router.get('/disponibilidad', controller.disponibilidad);

/** 👇 NUEVO: primero /mis para evitar que cualquier middleware intercepte */
router.get('/mis', controller.listarMisEventos);

/** CRUD general */
router.post('/', controller.crearEventoReservado);
router.get('/', controller.listarEventosReservados);
router.put('/:id', controller.actualizarEventoReservado);
router.patch('/:id/cancelar', controller.cancelarEventoReservado);

module.exports = router;
