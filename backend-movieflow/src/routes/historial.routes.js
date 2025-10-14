const { Router } = require('express');
const router = Router();
const ctrl = require('../controllers/historial.controller');

// Si tienes middleware de admin, colócalo aquí:
// const { verificarTokenAdmin } = require('../middlewares/authAdmin');
// router.use(verificarTokenAdmin);

router.get('/admin/historial/opciones', ctrl.opciones);
router.get('/admin/historial/ventas', ctrl.listarVentas);
router.get('/admin/historial/funciones', ctrl.funciones);

module.exports = router;
