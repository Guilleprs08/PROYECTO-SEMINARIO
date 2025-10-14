// backend/middleware/upload.js
const multer = require('multer');

// Guardar en memoria para poder manipular antes de almacenar
const storage = multer.memoryStorage();

module.exports = multer({ storage });











