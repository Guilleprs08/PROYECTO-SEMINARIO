const express = require("express");
const router = express.Router();
const ticketPDFController = require("../../controllers/ventas/ticketpdf.controller");

// ✅ Generar y abrir ticket PDF
router.get("/:id_venta", ticketPDFController.generarTicketPDF);


module.exports = router;
