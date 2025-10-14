// src/routes/peliculas.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const {
  getSelectData,
  createPelicula,
  listPeliculas,
  getPeliculaById,
  updatePelicula,
  deletePelicula,
} = require('../controllers/nuevapelicula.controller');

// --- Multer ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `pelicula_${Date.now()}${ext}`);
  }
});
const fileFilter = (req, file, cb) => {
  const ok = /jpeg|jpg|png|webp/.test(file.mimetype) &&
             /jpeg|jpg|png|webp/.test(path.extname(file.originalname).toLowerCase());
  cb(ok ? null : new Error('Solo imágenes JPG/PNG/WEBP'), ok);
};
const upload = multer({ storage, fileFilter });

// --- Rutas ---
router.get('/peliculas/select-data', getSelectData);
router.get('/peliculas', listPeliculas);
router.post('/peliculas', upload.single('imagen'), createPelicula);
router.get('/peliculas/:id', getPeliculaById);
router.put('/peliculas/:id', upload.single('imagen'), updatePelicula);
router.delete('/peliculas/:id', deletePelicula);

module.exports = router;
