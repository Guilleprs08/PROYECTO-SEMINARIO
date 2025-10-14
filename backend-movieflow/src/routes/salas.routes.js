const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salas.controller');

router.get('/',    ctrl.listarSalas);
router.post('/',   ctrl.crearSala);
router.put('/:id', ctrl.actualizarSala);
router.delete('/:id', ctrl.eliminarSala);

// --- Asientos ---
router.post('/:id/asientos/generar', ctrl.generarAsientosSala);  // autogenerar NxM (ya lo tenías)
router.get('/:id/asientos',          ctrl.listarAsientosSala);   // listar mapa actual
router.post('/:id/asientos/replace', ctrl.reemplazarMapaAsientos); // 🔥 editor avanzado: reemplazar mapa

module.exports = router;

