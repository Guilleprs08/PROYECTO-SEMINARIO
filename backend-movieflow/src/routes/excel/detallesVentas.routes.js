const express = require('express');
const router = express.Router();

const { generarDetallesVentaExcel } =
  require('../../controllers/excel/detallesVentas.controller');

router.post('/detalles-venta/excel', generarDetallesVentaExcel);

module.exports = router;
