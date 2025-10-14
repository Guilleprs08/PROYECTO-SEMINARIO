// backend/routes/reservas.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/reservas.controller');

router.get('/mis/:clienteId', ctrl.getMisReservas);
router.put('/:id/cancelar', ctrl.cancelarReserva);

module.exports = router;
