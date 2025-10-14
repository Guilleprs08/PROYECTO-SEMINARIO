const express = require('express');
const router = express.Router();

const {
  asignarPermisos,
  obtenerModulosYSubmodulos,
  getCantidadPermisosPorRol,
  getPermisosPorRol
} = require('../controllers/asignarmenu.controller');

router.post('/permisos', asignarPermisos);
router.get('/asignacion-modulos', obtenerModulosYSubmodulos);
router.get('/permisos-por-rol', getCantidadPermisosPorRol);
router.get('/permisos-por-rol/:rolId', getPermisosPorRol); // ✅ CORRECTO

module.exports = router;
