const db = require('../config/db');
const oracledb = require('oracledb');
const xss = require('xss');
const { validationResult } = require('express-validator');

/**
 * Helper: genera el siguiente código LOTE-YYYYMMDD-###
 * Se basa en el último código del día (para evitar colisiones).
 */
async function generarCodigosLote(connection, cuantos) {
  const hoy = new Date();
  const yyyymmdd = hoy.toISOString().slice(0,10).replace(/-/g,''); // 20250922
  const prefijo = `LOTE-${yyyymmdd}-`;

  const { rows } = await connection.execute(
    `SELECT CODIGO_LOTE
       FROM POS_PRODUCTO_LOTE
      WHERE CODIGO_LOTE LIKE :pref
      ORDER BY CODIGO_LOTE DESC
      FETCH FIRST 1 ROWS ONLY`,
    { pref: `${prefijo}%` },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  let ultimo = 0;
  if (rows.length > 0 && rows[0].CODIGO_LOTE) {
    const cod = rows[0].CODIGO_LOTE;        // ej. LOTE-20250922-007
    const suf = cod.split('-').pop();       // "007"
    ultimo = parseInt(suf, 10) || 0;
  }

  const codigos = [];
  for (let i = 1; i <= cuantos; i++) {
    const seq = String(ultimo + i).padStart(3, '0');
    codigos.push(`${prefijo}${seq}`);
  }
  return codigos;
}

/**
 * 📌 Agregar varios LOTES en lote
 * Body:
 *   { "lotes": [{ "nombre": "Lote A" }, { "nombre": "Lote B" }, ... ] }
 */
exports.agregarLotes = async (req, res) => {
  // Validaciones de express-validator (si las usas en la ruta)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let { lotes } = req.body;

  if (!Array.isArray(lotes) || lotes.length === 0) {
    return res.status(400).json({ message: 'Debe enviar al menos un lote.' });
  }

  // Sanitizar y normalizar – solo necesitamos "nombre"
  lotes = lotes
    .map(l => ({ nombre: xss(l.nombre?.trim() || '') }))
    .filter(l => l.nombre.length > 0);

  if (lotes.length === 0) {
    return res.status(400).json({ message: 'Todos los lotes deben tener un nombre válido.' });
  }

  // Evitar duplicados dentro del mismo payload (mismo nombre repetido)
  const setNombres = new Set();
  const repetidosEnPayload = [];
  lotes = lotes.filter(l => {
    const key = l.nombre.toLowerCase();
    if (setNombres.has(key)) {
      repetidosEnPayload.push(l.nombre);
      return false;
    }
    setNombres.add(key);
    return true;
  });
  if (repetidosEnPayload.length) {
    return res.status(400).json({ message: `Nombre repetido en el envío: ${repetidosEnPayload.join(', ')}` });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // Chequear duplicados existentes por NOMBRE (case-insensitive)
    const nombres = lotes.map(l => l.nombre.toLowerCase());
    const placeholders = nombres.map((_, i) => `:n${i}`).join(', ');
    const bindNombres = Object.fromEntries(nombres.map((n, i) => [`n${i}`, n]));

    const dupCheck = await connection.execute(
      `SELECT LOWER(NOMBRE) AS NOMBRE
         FROM POS_PRODUCTO_LOTE
        WHERE LOWER(NOMBRE) IN (${placeholders})`,
      bindNombres,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (dupCheck.rows.length > 0) {
      const duplicados = dupCheck.rows.map(r => r.NOMBRE).join(', ');
      return res.status(400).json({ message: `El nombre ya existe: ${duplicados}` });
    }

    // Generar códigos para todos los lotes que se insertarán
    const codigos = await generarCodigosLote(connection, lotes.length);

    // Insertar en transacción
    await connection.execute('BEGIN NULL; END;');
    for (let i = 0; i < lotes.length; i++) {
      const nombre = lotes[i].nombre;
      const codigo = codigos[i];

      await connection.execute(
        `INSERT INTO POS_PRODUCTO_LOTE (CODIGO_LOTE, NOMBRE, FECHA_REGISTRO)
         VALUES (:codigo, :nombre, SYSDATE)`,
        { codigo, nombre },
        { autoCommit: false }
      );
    }

    await connection.commit();

    // Traer todo (útil para refrescar lista en UI)
    const all = await connection.execute(
      `SELECT ID, CODIGO_LOTE, NOMBRE, TO_CHAR(FECHA_REGISTRO,'YYYY-MM-DD') AS FECHA_REGISTRO
         FROM POS_PRODUCTO_LOTE
        ORDER BY FECHA_REGISTRO DESC, ID DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.status(201).json({
      message: `${lotes.length} lote(s) agregado(s) correctamente.`,
      lotesNuevos: codigos.map((c, i) => ({ codigo_lote: c, nombre: lotes[i].nombre })),
      lotesTodos: all.rows
    });

  } catch (error) {
    console.error('Error al guardar lotes en lote:', error);
    if (connection) await connection.rollback();
    res.status(500).json({ message: 'Error al guardar lotes.' });
  } finally {
    if (connection) await connection.close();
  }
};

/**
 * 🔍 Buscar LOTES por código o nombre
 * GET /api/lotes?q=...
 */
exports.buscarLotes = async (req, res) => {
  const q = xss(req.query.q?.trim() || '');
  if (!q) return res.json([]);

  let connection;
  try {
    connection = await db.getConnection();
    const { rows } = await connection.execute(
      `SELECT ID, CODIGO_LOTE, NOMBRE
         FROM POS_PRODUCTO_LOTE
        WHERE LOWER(CODIGO_LOTE) LIKE :q OR LOWER(NOMBRE) LIKE :q
        ORDER BY NOMBRE ASC`,
      { q: `%${q.toLowerCase()}%` },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al buscar lotes:', error);
    res.status(500).json({ message: 'Error al buscar lotes.' });
  } finally {
    if (connection) await connection.close();
  }
};

/**
 * 📋 Listar todos los LOTES
 */
exports.listarLotes = async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const { rows } = await connection.execute(
      `SELECT ID, CODIGO_LOTE, NOMBRE, TO_CHAR(FECHA_REGISTRO,'YYYY-MM-DD') AS FECHA_REGISTRO
         FROM POS_PRODUCTO_LOTE
        ORDER BY FECHA_REGISTRO DESC, ID DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar lotes:', error);
    res.status(500).json({ message: 'Error al listar lotes.' });
  } finally {
    if (connection) await connection.close();
  }
};
