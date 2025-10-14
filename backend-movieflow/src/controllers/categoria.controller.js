const oracledb = require('oracledb');
const db = require('../config/db'); // mantiene tu estructura

// GET /api/categorias
const getCategorias = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT 
         id_categoria AS "ID",
         nombre       AS "NOMBRE",
         sinopsis     AS "SINOPSIS"
       FROM categorias
       ORDER BY id_categoria DESC`,
      [],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        // Convierte CLOB a string para que se pueda serializar a JSON sin streams
        fetchInfo: { SINOPSIS: { type: oracledb.STRING } }
      }
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('GET categorias ->', error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  } finally {
    if (connection) await connection.close();
  }
};

// POST /api/categorias
const createCategoria = async (req, res) => {
  let connection;
  try {
    let { nombre, sinopsis } = req.body;

    // Sanitizado mínimo
    nombre = (nombre || '').trim();
    sinopsis = (sinopsis || '').trim();

    if (!nombre || !sinopsis) {
      return res.status(400).json({ message: 'Nombre y sinopsis son obligatorios' });
    }
    if (nombre.length > 80) {
      return res.status(400).json({ message: 'El nombre no debe superar 80 caracteres' });
    }
    if (sinopsis.length > 500) {
      return res.status(400).json({ message: 'La sinopsis no debe superar 500 caracteres' });
    }

    connection = await db.getConnection();

    // 1) Duplicado por nombre (case-insensitive)
    const checkNombre = await connection.execute(
      `SELECT COUNT(*) AS "TOTAL"
         FROM categorias
        WHERE LOWER(nombre) = LOWER(:nombre)`,
      { nombre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((checkNombre.rows?.[0]?.TOTAL ?? 0) > 0) {
      return res.status(409).json({ message: 'La categoría ya existe' });
    }

    // 2) Duplicado por sinopsis (CLOB) -> usar DBMS_LOB.COMPARE
    // Nota: comparación exacta (case-sensitive). Si quieres case-insensitive, te propongo luego una columna hash.
    const checkSinopsis = await connection.execute(
      `SELECT COUNT(*) AS "TOTAL"
         FROM categorias
        WHERE DBMS_LOB.COMPARE(sinopsis, TO_CLOB(:sinopsis)) = 0`,
      { sinopsis },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((checkSinopsis.rows?.[0]?.TOTAL ?? 0) > 0) {
      return res.status(409).json({ message: 'La sinopsis ya está registrada' });
    }

    // 3) Nuevo ID (si no usas secuencia)
    const idResult = await connection.execute(
      `SELECT NVL(MAX(id_categoria), 0) + 1 AS "NUEVO_ID" FROM categorias`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const nuevoId = idResult.rows?.[0]?.NUEVO_ID;

    // 4) Insert
    await connection.execute(
      `INSERT INTO categorias (id_categoria, nombre, sinopsis)
       VALUES (:id, :nombre, TO_CLOB(:sinopsis))`,
      { id: nuevoId, nombre, sinopsis },
      { autoCommit: true }
    );

    res.status(201).json({ message: 'Categoría registrada correctamente' });
  } catch (error) {
    console.error('POST categorias ->', error);
    // Devuelve detalle útil en desarrollo; en prod mantener genérico
    const oracleMsg = error?.message || '';
    if (oracleMsg.includes('ORA-')) {
      return res.status(500).json({ message: `Error Oracle: ${oracleMsg}` });
    }
    res.status(500).json({ message: 'Error al registrar la categoría' });
  } finally {
    if (connection) await connection.close();
  }
};

module.exports = {
  getCategorias,
  createCategoria
};
