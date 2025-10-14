// routes/combo/combos.routes.js
const express = require('express');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });
const ctrl = require('../../controllers/combo/CrearcomboProducto.controller');

const router = express.Router();

// Monta esto en server.js con: app.use('/api', require('./src/routes/combo/combos.routes'));
router.get('/categoria-combo', ctrl.listarCategoriasCombo);
router.get('/combos', ctrl.listarCombos);
router.post('/combos', upload.single('imagen'), ctrl.crearComboProducto);
router.get('/combos/buscar', ctrl.buscarCombos);
router.get('/combos/:id', ctrl.obtenerComboCompleto);
router.put('/combos/:id/cabecera', upload.single('imagen'), ctrl.actualizarComboCabecera);

// servir imagen almacenada en BLOB
router.get('/combos/:id/imagen', ctrl.getImagenCombo);

module.exports = router;
