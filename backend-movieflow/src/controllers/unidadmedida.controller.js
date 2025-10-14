// backend-movieflow/src/controllers/unidadmedida.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');

const OUT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// Sanitizado simple (evitar inyección de HTML)
function clean(s) {
  if (s == null) return '';
  return String(s).trim().replace(/[<>"']/g, '');
}

/**
 * 📌 Agregar varias unidades de medida en lote
 * Body: { unidades: [{ codigo?:string, nombre:string }, ...] }
 * - Si no mandan 'codigo', lo generamos como UM001, UM002, ...
 */
exports.agregarUnidadesMedidaLote = async (req, res) => {
  let cn;
  try {
    let { unidades } = req.body || {};
    if (!Array.isArray(unidades) || unidades.length === 0) {
      return res.status(400).json({ message: 'Debe enviar al menos una unidad de medida.' });
    }

    // Normaliza y filtra
    unidades = unidades
      .map(um => ({
        codigo: clean(um?.codigo || ''),
        nombre: clean(um?.nombre || '')
      }))
      .filter(um => um.nombre);

    if (unidades.length === 0) {
      return res.status(400).json({ message: 'Todas las unidades deben tener un nombre válido.' });
    }

    cn = await db.getConnection();

    // Verificar duplicados por NOMBRE (case-insensitive)
    const nombres = unidades.map(u => u.nombre.toLowerCase());
    const binds = {};
    const ph = nombres.map((_, i) => `:n${i}`).join(', ');
    nombres.forEach((n, i) => (binds[`n${i}`] = n));

    const dup = await cn.execute(
      `SELECT LOWER(NOMBRE) AS NOMBRE
         FROM POS_UNIDAD_MEDIDA
        WHERE LOWER(NOMBRE) IN (${ph})`,
      binds,
      OUT
    );
    if (dup.rows.length > 0) {
      const duplicados = dup.rows.map(r => r.NOMBRE).join(', ');
      return res.status(400).json({ message: `El nombre ya existe: ${duplicados}` });
    }

    // Si hay unidades sin 'codigo', generamos consecutivo UM###
    const last = await cn.execute(
      `SELECT CODIGO
         FROM POS_UNIDAD_MEDIDA
        WHERE CODIGO IS NOT NULL
        ORDER BY ID DESC
        FETCH FIRST 1 ROWS ONLY`,
      [],
      OUT
    );
    let ultimo = 0;
    if (last.rows?.length) {
      const cod = String(last.rows[0].CODIGO || '');
      const n = parseInt(cod.replace(/^\D+/,'') || '0', 10);
      if (!isNaN(n)) ultimo = n;
    }

    // Prepara inserciones
    let idxAuto = 0;
    for (const um of unidades) {
      const codigo = um.codigo || `UM${String(ultimo + (++idxAuto)).padStart(3, '0')}`;
      await cn.execute(
        `INSERT INTO POS_UNIDAD_MEDIDA (CODIGO, NOMBRE)
               VALUES (:codigo, :nombre)`,
        { codigo, nombre: um.nombre },
        { autoCommit: false }
      );
    }

    await cn.commit();

    // Devuelve todas (útil para refrescar la UI)
    const all = await cn.execute(
      `SELECT ID, CODIGO, NOMBRE
         FROM POS_UNIDAD_MEDIDA
        ORDER BY CODIGO ASC, NOMBRE ASC`,
      [],
      OUT
    );

    res.status(201).json({
      message: `${unidades.length} unidades de medida agregadas correctamente.`,
      unidadesTodas: all.rows
    });
  } catch (err) {
    console.error('Error al guardar unidades de medida en lote:', err);
    if (cn) { try { await cn.rollback(); } catch {} }
    res.status(500).json({ message: 'Error al guardar unidades de medida.' });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};

/**
 * 🔍 Buscar unidades de medida
 * GET /api/unidadmedida/buscar?q=...
 */
exports.buscarUnidadMedida = async (req, res) => {
  let cn;
  try {
    const q = clean(req.query.q || '');
    if (!q) return res.json([]);

    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT ID, CODIGO, NOMBRE
         FROM POS_UNIDAD_MEDIDA
        WHERE LOWER(CODIGO) LIKE :q OR LOWER(NOMBRE) LIKE :q
        ORDER BY CODIGO ASC, NOMBRE ASC`,
      { q: `%${q.toLowerCase()}%` },
      OUT
    );
    res.json(rs.rows);
  } catch (err) {
    console.error('Error al buscar unidades de medida:', err);
    res.status(500).json({ message: 'Error al buscar unidades de medida.' });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};

/**
 * 🗑 Eliminar unidad de medida por CODIGO
 * DELETE /api/unidadmedida/:codigo
 */
exports.eliminarUnidadMedida = async (req, res) => {
  let cn;
  try {
    const codigo = clean(req.params.codigo || '');
    if (!codigo) return res.status(400).json({ message: 'Código no válido.' });

    cn = await db.getConnection();
    const rs = await cn.execute(
      `DELETE FROM POS_UNIDAD_MEDIDA WHERE CODIGO = :codigo`,
      { codigo },
      { autoCommit: true }
    );

    if (rs.rowsAffected === 0) {
      return res.status(404).json({ message: 'Unidad de medida no encontrada.' });
    }
    res.json({ message: `Unidad de medida ${codigo} eliminada correctamente.` });
  } catch (err) {
    console.error('Error al eliminar unidad de medida:', err);
    res.status(500).json({ message: 'Error al eliminar unidad de medida.' });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};

/**
 * 📋 Listar todas las unidades de medida
 * GET /api/unidadmedida
 */
exports.listarUnidadesMedida = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT ID, CODIGO, NOMBRE
         FROM POS_UNIDAD_MEDIDA
        ORDER BY CODIGO ASC, NOMBRE ASC`,
      [],
      OUT
    );
    res.json(rs.rows);
  } catch (err) {
    console.error('Error al listar unidades de medida:', err);
    res.status(500).json({ message: 'Error al listar unidades de medida.' });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};
