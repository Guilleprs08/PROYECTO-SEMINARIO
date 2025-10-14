// backend-movieflow/src/routes/pdf/detalles.routes.js
const express = require("express");
const router = express.Router();

// ⚠️ Estás dentro de routes/pdf, por eso subimos dos niveles
const ctrl = require("../../controllers/pdf/detallesVenta.controller");

// POST porque el front envía un snapshot (filtros + filas) en el body
// Montarás esto bajo /api/pdf en server.js, por eso NO repetimos /pdf aquí.
router.post("/detalles-venta", ctrl.generarDetallesVentaPDF);

module.exports = router;
