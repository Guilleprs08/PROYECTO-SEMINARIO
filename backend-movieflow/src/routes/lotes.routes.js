const express = require('express');
const { body } = require('express-validator');
const lotesCtrl = require('../controllers/lotes.controller');

const router = express.Router();

// Alta en lote de LOTES
router.post(
  '/',
  [
    body('lotes').isArray({ min: 1 }).withMessage('Debe enviar al menos un lote.'),
    body('lotes.*.nombre').isString().trim().notEmpty().withMessage('Cada lote debe tener nombre.')
  ],
  lotesCtrl.agregarLotes
);

// Buscar por q
router.get('/buscar', lotesCtrl.buscarLotes);

// Listar todos
router.get('/', lotesCtrl.listarLotes);

module.exports = router;
