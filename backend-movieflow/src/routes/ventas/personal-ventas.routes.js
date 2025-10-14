const express = require("express");
const router = express.Router();

const personalVentasController = require("../../controllers/ventas/personalventas.controller");

// ✅ Endpoint para listar productos visibles al personal de ventas
router.get("/productos", personalVentasController.listarProductos);
router.get("/producto/:id", personalVentasController.obtenerProducto);
router.post("/procesar", personalVentasController.procesarVenta);

// ✅ Imagen de producto (BLOB) – alias plural y singular
router.get("/productos/:id/imagen", personalVentasController.imagenProducto);
router.get("/producto/:id/imagen", personalVentasController.imagenProducto);

// (opcional) ping para verificar montaje del router
router.get("/ping", (_req, res) => res.json({ ok: true, scope: "personal-ventas" }));

module.exports = router;
