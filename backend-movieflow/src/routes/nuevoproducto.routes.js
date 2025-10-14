// backend-movieflow/src/routes/nuevoproducto.routes.js
const express = require('express');
const multer = require('multer');
const nuevoProductoController = require('../controllers/nuevoproducto.controller');

const router = express.Router();

/* =============================
 * Multer en memoria (5 MB máx)
 * ============================= */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    // Acepta imágenes comunes; ajusta si necesitas más tipos
    if (/^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido. Solo imágenes PNG/JPG/GIF/WebP.'));
  },
});

// 📌 Crear nuevo producto con imagen (campo: "imagen")
router.post('/', upload.single('imagen'), nuevoProductoController.crearProducto);

// 📌 Listar todos los productos (no devuelve BLOB)
router.get('/', nuevoProductoController.getProductos);

// 📌 Servir la imagen BLOB de un producto (usa IMAGEN_MIME)
router.get('/:id/imagen', nuevoProductoController.getImagenProducto);

// 📌 Actualizar producto (opcionalmente con nueva imagen)
router.put('/:id', upload.single('imagen'), nuevoProductoController.actualizarProducto);

// 📌 Eliminar producto por ID
router.delete('/:id', nuevoProductoController.eliminarProducto);

/* =============================
 * Manejo simple de errores Multer
 * ============================= */
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'La imagen excede el tamaño máximo (5MB).' });
    }
    return res.status(400).json({ message: `Error de carga: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ message: err.message || 'Error al procesar el archivo.' });
  }
  return res.status(500).json({ message: 'Error desconocido.' });
});

module.exports = router;
