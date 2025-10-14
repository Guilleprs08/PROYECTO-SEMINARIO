// src/controllers/nuevapelicula.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ===============================
// Configuración de multer para imágenes
// ===============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

// ===============================
// GET /api/peliculas/select-data
// ===============================
const getSelectData = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [idiomas, clasificaciones, formatos, salas, categorias] = await Promise.all([
      connection.execute(
        `SELECT ID_IDIOMA AS "id", NOMBRE AS "nombre" FROM IDIOMAS ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `SELECT ID_CLASIFICACION AS "id", NOMBRE AS "nombre" FROM CLASIFICACION ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `SELECT ID_FORMATO AS "id", NOMBRE AS "nombre" FROM FORMATO ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `SELECT ID_SALA AS "id", NOMBRE AS "nombre" FROM SALAS ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `SELECT ID_CATEGORIA AS "id", NOMBRE AS "nombre" FROM CATEGORIAS ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
    ]);

    res.json({
      idiomas: idiomas.rows ?? [],
      clasificaciones: clasificaciones.rows ?? [],
      formatos: formatos.rows ?? [],
      salas: salas.rows ?? [],
      categorias: categorias.rows ?? [],
    });
  } catch (err) {
    console.error('GET select-data ->', err);
    res.status(500).json({ message: 'Error al obtener datos de referencia' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

// ===============================
// POST /api/peliculas
// ===============================
const createPelicula = async (req, res) => {
  let connection;
  try {
    const titulo = (req.body.titulo || '').trim();
    const duracionMin = Number(req.body.duracionMin ?? req.body.duracion);

    const id_idioma        = Number(req.body.id_idioma ?? req.body.idIdioma ?? req.body.idioma);
    const id_clasificacion = Number(req.body.id_clasificacion ?? req.body.idClasificacion ?? req.body.clasificacion);
    const id_formato       = Number(req.body.id_formato ?? req.body.idFormato ?? req.body.formato);
    const id_categoria     = Number(req.body.id_categoria ?? req.body.idCategoria ?? req.body.categoria);

    const imagen_url = req.file ? (`/uploads/${req.file.filename}`).replace(/\\/g, '/') : null;
    if (!imagen_url) return res.status(400).json({ message: 'Debe subir una imagen' });

    if (!titulo) return res.status(400).json({ message: 'El título es obligatorio' });
    if (!duracionMin || duracionMin <= 0 || duracionMin > 600)
      return res.status(400).json({ message: 'Duración inválida (1-600)' });

    const faltantes = [];
    if (!id_idioma) faltantes.push('idioma');
    if (!id_clasificacion) faltantes.push('clasificación');
    if (!id_formato) faltantes.push('formato');
    if (!id_categoria) faltantes.push('categoría');
    if (faltantes.length) return res.status(400).json({ message: `Faltan campos: ${faltantes.join(', ')}` });

    connection = await db.getConnection();

    // Validar FKs
    const [okI, okC, okF, okCat] = await Promise.all([
      connection.execute(`SELECT COUNT(*) AS "T" FROM IDIOMAS WHERE ID_IDIOMA = :id`, { id: id_idioma }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(`SELECT COUNT(*) AS "T" FROM CLASIFICACION WHERE ID_CLASIFICACION = :id`, { id: id_clasificacion }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(`SELECT COUNT(*) AS "T" FROM FORMATO WHERE ID_FORMATO = :id`, { id: id_formato }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(`SELECT COUNT(*) AS "T" FROM CATEGORIAS WHERE ID_CATEGORIA = :id`, { id: id_categoria }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    ]);
    if (!okI.rows[0].T)   return res.status(400).json({ message: 'Idioma inexistente' });
    if (!okC.rows[0].T)   return res.status(400).json({ message: 'Clasificación inexistente' });
    if (!okF.rows[0].T)   return res.status(400).json({ message: 'Formato inexistente' });
    if (!okCat.rows[0].T) return res.status(400).json({ message: 'Categoría inexistente' });

    // ¿Existe secuencia?
    const seq = await connection.execute(
      `SELECT COUNT(*) AS "T" FROM USER_SEQUENCES WHERE SEQUENCE_NAME = 'SECUENCIA_PELICULA'`,
      [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    let insertSql;
    const bind = { titulo, duracionMin, id_idioma, id_clasificacion, id_formato, id_categoria, imagen_url };

    if (seq.rows[0].T > 0) {
      insertSql = `
        INSERT INTO PELICULA (
          ID_PELICULA, TITULO, DURACION_MINUTOS,
          ID_IDIOMA, ID_CLASIFICACION, ID_FORMATO, ID_CATEGORIA, IMAGEN_URL, ESTADO
        ) VALUES (
          SECUENCIA_PELICULA.NEXTVAL, :titulo, :duracionMin,
          :id_idioma, :id_clasificacion, :id_formato, :id_categoria, TO_CLOB(:imagen_url), 'ACTIVA'
        )
        RETURNING ID_PELICULA INTO :outId
      `;
      bind.outId = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
    } else {
      const nextIdRes = await connection.execute(
        `SELECT NVL(MAX(ID_PELICULA), 0) + 1 AS "N" FROM PELICULA`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      insertSql = `
        INSERT INTO PELICULA (
          ID_PELICULA, TITULO, DURACION_MINUTOS,
          ID_IDIOMA, ID_CLASIFICACION, ID_FORMATO, ID_CATEGORIA, IMAGEN_URL, ESTADO
        ) VALUES (
          :newId, :titulo, :duracionMin,
          :id_idioma, :id_clasificacion, :id_formato, :id_categoria, TO_CLOB(:imagen_url), 'ACTIVA'
        )
      `;
      bind.newId = nextIdRes.rows[0].N;
    }

    const result = await connection.execute(insertSql, bind, { autoCommit: true });
    const insertedId = bind.outId?.val ?? result?.outBinds?.outId ?? bind.newId ?? null;

    return res.status(201).json({
      message: 'Película registrada correctamente',
      ID: insertedId,
      id: insertedId,
      imagenUrl: imagen_url,
      estado: 'ACTIVA'
    });

  } catch (err) {
    console.error('POST /api/peliculas ->', err);
    res.status(500).json({ message: 'Error al registrar película' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

// ===============================
// GET /api/peliculas  (lista ACT/INACT)
// ===============================
const listPeliculas = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const qRaw = (req.query.q || '').trim();
    const categoriaIdRaw = req.query.categoriaId;

    const where = [];
    const bind = {};

    if (qRaw) {
      const safe = qRaw.toUpperCase().replace(/[%_\\]/g, (c) => '\\' + c);
      bind.q = `%${safe}%`;
      where.push(`UPPER(p.TITULO) LIKE :q ESCAPE '\\'`);
    }
    if (categoriaIdRaw && Number(categoriaIdRaw)) {
      bind.categoriaId = Number(categoriaIdRaw);
      where.push(`p.ID_CATEGORIA = :categoriaId`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.ID_PELICULA              AS id,
        p.TITULO                   AS titulo,
        p.DURACION_MINUTOS         AS duracionMin,
        p.IMAGEN_URL               AS imagenUrl,
        p.ESTADO                   AS estado,
        i.NOMBRE                   AS idiomaNombre,
        c.NOMBRE                   AS clasificacionCodigo,
        f.NOMBRE                   AS formatoNombre,
        cat.NOMBRE                 AS categoriaNombre
      FROM PELICULA p
      LEFT JOIN IDIOMAS i        ON i.ID_IDIOMA        = p.ID_IDIOMA
      LEFT JOIN CLASIFICACION c  ON c.ID_CLASIFICACION = p.ID_CLASIFICACION
      LEFT JOIN FORMATO f        ON f.ID_FORMATO       = p.ID_FORMATO
      LEFT JOIN CATEGORIAS cat   ON cat.ID_CATEGORIA   = p.ID_CATEGORIA
      ${whereSql}
      ORDER BY p.ID_PELICULA DESC
    `;

    const r = await connection.execute(sql, bind, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { IMAGENURL: { type: oracledb.STRING } }
    });

    const data = r.rows.map(R => ({
      id: R.ID,
      titulo: R.TITULO,
      duracionMin: R.DURACIONMIN,
      imagenUrl: (R.IMAGENURL || '').replace(/\\/g, '/'),
      estado: R.ESTADO,
      idiomaNombre: R.IDIOMANOMBRE,
      clasificacionCodigo: R.CLASIFICACIONCODIGO,
      formatoNombre: R.FORMATONOMBRE,
      categoriaNombre: R.CATEGORIANOMBRE
    }));
    res.json(data);
  } catch (err) {
    console.error('GET /api/peliculas ->', err);
    res.status(500).json({ message: 'Error al obtener películas' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

// ===============================
// DELETE /api/peliculas/:id  (HARD DELETE)
// ===============================
const deletePelicula = async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    connection = await db.getConnection();

    // 1) Verificar que exista y obtener la imagen
    const cur = await connection.execute(
      `SELECT IMAGEN_URL FROM PELICULA WHERE ID_PELICULA = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { IMAGEN_URL: { type: oracledb.STRING } } }
    );
    if (!cur.rows.length) return res.status(404).json({ message: 'No existe la película' });
    const img = (cur.rows[0].IMAGEN_URL || '').replace(/\\/g, '/');

    // 2) Validar que NO tenga funciones ACTIVAS
    const cnt = await connection.execute(
      `SELECT COUNT(*) AS "T" FROM FUNCIONES WHERE ID_PELICULA = :id AND ESTADO = 'ACTIVA'`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (cnt.rows[0].T > 0) {
      return res.status(409).json({ message: 'No se puede eliminar: la película tiene funciones activas asignadas.' });
    }

    // 3) Eliminar película
    await connection.execute(
      `DELETE FROM PELICULA WHERE ID_PELICULA = :id`,
      { id },
      { autoCommit: true }
    );

    // 4) Borrar imagen del disco (si existía)
    if (img && img.startsWith('/uploads/')) {
      const abs = path.join(__dirname, '../../', img);
      fs.promises.unlink(abs).catch(() => {});
    }

    res.json({ message: 'Película eliminada' });
  } catch (err) {
    console.error('DELETE /api/peliculas/:id ->', err);
    if (String(err.message || '').includes('ORA-02292')) {
      return res.status(409).json({ message: 'No se puede eliminar: la película tiene funciones asignadas.' });
    }
    res.status(500).json({ message: 'Error al eliminar la película' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

// ===============================
// GET /api/peliculas/:id
// ===============================
const getPeliculaById = async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    connection = await db.getConnection();
    const sql = `
      SELECT
        p.ID_PELICULA      AS id,
        p.TITULO           AS titulo,
        p.DURACION_MINUTOS AS duracionMin,
        p.IMAGEN_URL       AS imagenUrl,
        p.ID_IDIOMA        AS id_idioma,
        p.ID_CLASIFICACION AS id_clasificacion,
        p.ID_FORMATO       AS id_formato,
        p.ID_CATEGORIA     AS id_categoria,
        p.ESTADO           AS estado,
        i.NOMBRE           AS idiomaNombre,
        c.NOMBRE           AS clasificacionCodigo,
        f.NOMBRE           AS formatoNombre,
        cat.NOMBRE         AS categoriaNombre
      FROM PELICULA p
      LEFT JOIN IDIOMAS i        ON i.ID_IDIOMA        = p.ID_IDIOMA
      LEFT JOIN CLASIFICACION c  ON c.ID_CLASIFICACION = p.ID_CLASIFICACION
      LEFT JOIN FORMATO f        ON f.ID_FORMATO       = p.ID_FORMATO
      LEFT JOIN CATEGORIAS cat   ON cat.ID_CATEGORIA   = p.ID_CATEGORIA
      WHERE p.ID_PELICULA = :id
    `;
    const r = await connection.execute(sql, { id }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { IMAGENURL: { type: oracledb.STRING } }
    });
    if (!r.rows.length) return res.status(404).json({ message: 'No existe' });

    const R = r.rows[0];
    res.json({
      id: R.ID,
      titulo: R.TITULO,
      duracionMin: R.DURACIONMIN,
      imagenUrl: (R.IMAGENURL || '').replace(/\\/g, '/'),
      id_idioma: R.ID_IDIOMA,
      id_clasificacion: R.ID_CLASIFICACION,
      id_formato: R.ID_FORMATO,
      id_categoria: R.ID_CATEGORIA,
      estado: R.ESTADO,
      idiomaNombre: R.IDIOMANOMBRE,
      clasificacionCodigo: R.CLASIFICACIONCODIGO,
      formatoNombre: R.FORMATONOMBRE,
      categoriaNombre: R.CATEGORIANOMBRE
    });
  } catch (err) {
    console.error('GET /api/peliculas/:id ->', err);
    res.status(500).json({ message: 'Error al obtener la película' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

// ===============================
// PUT /api/peliculas/:id
//  🔒 Bloquea inactivar si hay funciones ACTIVAS
// ===============================
const updatePelicula = async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    const titulo = (req.body.titulo || '').trim();
    const duracionMin = Number(req.body.duracionMin ?? req.body.duracion);

    const id_idioma        = Number(req.body.id_idioma ?? req.body.idIdioma);
    const id_clasificacion = Number(req.body.id_clasificacion ?? req.body.idClasificacion);
    const id_formato       = Number(req.body.id_formato ?? req.body.idFormato);
    const id_categoria     = Number(req.body.id_categoria ?? req.body.idCategoria);

    // estado solicitado
    let estado = (req.body.estado || '').toUpperCase();
    if (!['ACTIVA', 'INACTIVA'].includes(estado)) estado = 'ACTIVA';

    connection = await db.getConnection();

    // Imagen actual
    const cur = await connection.execute(
      `SELECT IMAGEN_URL FROM PELICULA WHERE ID_PELICULA = :id`,
      { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { IMAGEN_URL: { type: oracledb.STRING } } }
    );
    if (!cur.rows.length) {
      // Si se subió imagen en este intento y la película no existe, limpiar archivo
      if (req.file) fs.promises.unlink(path.join(__dirname, '../../uploads', req.file.filename)).catch(() => {});
      return res.status(404).json({ message: 'No existe la película' });
    }
    const oldImage = (cur.rows[0].IMAGEN_URL || '').replace(/\\/g, '/');

    // ❗ Si intenta poner INACTIVA, validar que no tenga funciones ACTIVAS
    if (estado === 'INACTIVA') {
      const cnt = await connection.execute(
        `SELECT COUNT(*) AS "T" FROM FUNCIONES WHERE ID_PELICULA = :id AND ESTADO = 'ACTIVA'`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (cnt.rows[0].T > 0) {
        // limpiar imagen recién subida (si la hubo) para evitar huérfanos
        if (req.file) {
          const abs = path.join(__dirname, '../../uploads', req.file.filename);
          fs.promises.unlink(abs).catch(() => {});
        }
        return res.status(409).json({ message: 'No se puede inactivar: la película tiene funciones activas.' });
      }
    }

    const imagen_url = req.file ? (`/uploads/${req.file.filename}`).replace(/\\/g, '/') : oldImage;

    if (!titulo) return res.status(400).json({ message: 'El título es obligatorio' });
    if (!duracionMin || duracionMin <= 0 || duracionMin > 600)
      return res.status(400).json({ message: 'Duración inválida (1-600)' });

    await connection.execute(
      `
      UPDATE PELICULA SET
        TITULO            = :titulo,
        DURACION_MINUTOS  = :duracionMin,
        ID_IDIOMA         = :id_idioma,
        ID_CLASIFICACION  = :id_clasificacion,
        ID_FORMATO        = :id_formato,
        ID_CATEGORIA      = :id_categoria,
        IMAGEN_URL        = TO_CLOB(:imagen_url),
        ESTADO            = :estado
      WHERE ID_PELICULA = :id
      `,
      { id, titulo, duracionMin, id_idioma, id_clasificacion, id_formato, id_categoria, imagen_url, estado },
      { autoCommit: true }
    );

    if (req.file && oldImage && oldImage.startsWith('/uploads/')) {
      const abs = path.join(__dirname, '../../', oldImage);
      fs.promises.unlink(abs).catch(() => {});
    }

    // devolver normalizado
    const r = await connection.execute(
      `
      SELECT
        p.ID_PELICULA      AS id,
        p.TITULO           AS titulo,
        p.DURACION_MINUTOS AS duracionMin,
        p.IMAGEN_URL       AS imagenUrl,
        p.ESTADO           AS estado,
        i.NOMBRE           AS idiomaNombre,
        c.NOMBRE           AS clasificacionCodigo,
        f.NOMBRE           AS formatoNombre,
        cat.NOMBRE         AS categoriaNombre
      FROM PELICULA p
      LEFT JOIN IDIOMAS i        ON i.ID_IDIOMA        = p.ID_IDIOMA
      LEFT JOIN CLASIFICACION c  ON c.ID_CLASIFICACION = p.ID_CLASIFICACION
      LEFT JOIN FORMATO f        ON f.ID_FORMATO       = p.ID_FORMATO
      LEFT JOIN CATEGORIAS cat   ON cat.ID_CATEGORIA   = p.ID_CATEGORIA
      WHERE p.ID_PELICULA = :id
      `,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { IMAGENURL: { type: oracledb.STRING } } }
    );

    const R = r.rows[0];
    res.json({
      id: R.ID,
      titulo: R.TITULO,
      duracionMin: R.DURACIONMIN,
      imagenUrl: (R.IMAGENURL || '').replace(/\\/g, '/'),
      estado: R.ESTADO,
      idiomaNombre: R.IDIOMANOMBRE,
      clasificacionCodigo: R.CLASIFICACIONCODIGO,
      formatoNombre: R.FORMATONOMBRE,
      categoriaNombre: R.CATEGORIANOMBRE
    });
  } catch (err) {
    console.error('PUT /api/peliculas/:id ->', err);
    res.status(500).json({ message: 'Error al actualizar la película' });
  } finally {
    try { if (connection) await connection.close(); } catch {}
  }
};

module.exports = {
  getSelectData,
  createPelicula,
  listPeliculas,
  getPeliculaById,
  updatePelicula,
  deletePelicula,
  upload
};
