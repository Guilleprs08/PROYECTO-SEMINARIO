// src/routes/empleado.routes.js
const { Router } = require('express');
const router = Router();

const ctrl = require('../controllers/empleado.controller');
// middleware de auth si lo necesitas: const { verificarTokenEmpleado } = require('../middlewares/authEmpleado');

// Listados
router.get('/empleado/cartelera', ctrl.getCartelera);
router.get('/empleado/cartelera/:peliculaId/funciones', ctrl.getFuncionesByPelicula);
router.get('/empleado/funciones/:funcionId/asientos', ctrl.getAsientosByFuncion);

// Acciones
router.post('/empleado/funciones/:funcionId/vender', ctrl.postVender);
// Liberar reservas expiradas antes de cargar asientos
router.post('/empleado/funciones/:funcionId/liberar-reservas-vencidas', ctrl.postLiberarReservasVencidas);


module.exports = router;
