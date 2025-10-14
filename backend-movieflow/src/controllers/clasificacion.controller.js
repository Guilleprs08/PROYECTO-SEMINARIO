// src/controllers/clasificacion.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');

const TABLE = 'CLASIFICACION';              // tabla
const COL_ID = 'ID_CLASIFICACION';
const COL_NAME = 'NOMBRE';
const COL_DESC = 'DESCRIPCION';

// GET /api/clasificaciones
const getClasificaciones = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `
      SELECT
        ${COL_ID}   AS "ID",
        ${COL_NAME} AS "NOMBRE",
        ${COL_DESC} AS "DESCRIPCION"
      FROM ${TABLE}
      ORDER BY ${COL_ID} DESC
      `,
      [],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { DESCRIPCION: { type: oracledb.STRING } } // CLOB -> string
      }
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('GET clasificaciones ->', error);
    res.status(500).json({ message: 'Error al obtener clasificaciones' });
  } finally {
    if (connection) await connection.close();
  }
};

// POST /api/clasificaciones
const createClasificacion = async (req, res) => {
  let connection;
  try {
    let { nombre, descripcion } = req.body;
    nombre = (nombre || '').trim();
    descripcion = (descripcion || '').trim();

    if (!nombre || !descripcion) {
      return res.status(400).json({ message: 'Nombre y descripción son obligatorios' });
    }
    if (nombre.length > 50) {
      return res.status(400).json({ message: 'El nombre no debe superar 50 caracteres' });
    }
    if (descripcion.length > 500) {
      return res.status(400).json({ message: 'La descripción no debe superar 500 caracteres' });
    }

    connection = await db.getConnection();

    // Duplicado por nombre (case-insensitive)
    const dupNombre = await connection.execute(
      `SELECT COUNT(*) AS "TOTAL"
       FROM ${TABLE}
       WHERE LOWER(${COL_NAME}) = LOWER(:nombre)`,
      { nombre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dupNombre.rows?.[0]?.TOTAL ?? 0) > 0) {
      return res.status(409).json({ message: 'La clasificación ya existe' });
    }

    // Duplicado por descripción (CLOB exacta)
    const dupDesc = await connection.execute(
      `SELECT COUNT(*) AS "TOTAL"
       FROM ${TABLE}
       WHERE DBMS_LOB.COMPARE(${COL_DESC}, TO_CLOB(:descripcion)) = 0`,
      { descripcion },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if ((dupDesc.rows?.[0]?.TOTAL ?? 0) > 0) {
      return res.status(409).json({ message: 'La descripción ya está registrada' });
    }

    // Nuevo ID (si no usas secuencia)
    const idRes = await connection.execute(
      `SELECT NVL(MAX(${COL_ID}), 0) + 1 AS "NUEVO_ID" FROM ${TABLE}`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const nuevoId = idRes.rows?.[0]?.NUEVO_ID;

    // Insert
    await connection.execute(
      `INSERT INTO ${TABLE} (${COL_ID}, ${COL_NAME}, ${COL_DESC})
       VALUES (:id, :nombre, TO_CLOB(:descripcion))`,
      { id: nuevoId, nombre, descripcion },
      { autoCommit: true }
    );

    res.status(201).json({ message: 'Clasificación registrada correctamente' });
  } catch (error) {
    console.error('POST clasificaciones ->', error);
    res.status(500).json({ message: 'Error al registrar la clasificación' });
  } finally {
    if (connection) await connection.close();
  }
};

module.exports = { getClasificaciones, createClasificacion };
