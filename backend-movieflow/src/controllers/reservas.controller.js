// src/controllers/reservas.controller.js
const { getConnection } = require('../config/db');
const oracledb = require('oracledb');

// devolver objetos {COLUMNA: valor}
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// ===== helpers =====
function canCancelFrom(startIsoOrDate, estado) {
  const start = startIsoOrDate ? new Date(startIsoOrDate) : null;
  if (!start || isNaN(start)) return false;
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const H24 = 24 * 60 * 60 * 1000;
  const estadoOk = !['CANCELADO', 'FINALIZADO'].includes(String(estado || '').toUpperCase());
  return diffMs >= H24 && estadoOk;
}
const upper = (s) => String(s || '').trim().toUpperCase();

// Si por algún motivo viniera como array, convertimos por índice:
function normalizeRow(r) {
  if (!Array.isArray(r)) return r;
  const [
    ID, SALA_ID, SALA_NOMBRE,
    START_ISO, END_ISO, FECHA,
    HORA_INICIO, HORA_FIN,
    PERSONAS, ESTADO, NOTAS
  ] = r;
  return { ID, SALA_ID, SALA_NOMBRE, START_ISO, END_ISO, FECHA, HORA_INICIO, HORA_FIN, PERSONAS, ESTADO, NOTAS };
}

/* ================= LISTAR ================= */
// a) /mis/:clienteId         -> por CLIENTE_ID
// b) /mis/0?email=correo...  -> por correo en NOTAS (con/sin "UEMAIL:")
// c) Si vienen ambos, OR (trae TODO lo que sea del cliente o contenga su email)
exports.getMisReservas = async (req, res) => {
  const clienteId = Number(req.params.clienteId) || null;
  const emailRaw = (req.query.email || '').trim();
  const emailUpper = upper(emailRaw);

  if (!clienteId && !emailRaw) {
    return res.status(400).json({ message: 'clienteId o email requerido' });
  }

  let conn;
  try {
    conn = await getConnection();

    const baseSelect = `
      SELECT
        e.ID_EVENTO                                                AS ID,
        e.SALA_ID                                                  AS SALA_ID,
        NVL(s.NOMBRE, 'Sala '||e.SALA_ID)                          AS SALA_NOMBRE,
        TO_CHAR(e.START_TS, 'YYYY-MM-DD"T"HH24:MI:SS')             AS START_ISO,
        TO_CHAR(e.END_TS,   'YYYY-MM-DD"T"HH24:MI:SS')             AS END_ISO,
        TO_CHAR(e.START_TS, 'YYYY-MM-DD')                          AS FECHA,
        TO_CHAR(e.START_TS, 'HH24:MI')                             AS HORA_INICIO,
        TO_CHAR(e.END_TS,   'HH24:MI')                             AS HORA_FIN,
        e.PERSONAS                                                AS PERSONAS,
        e.ESTADO                                                  AS ESTADO,
        e.NOTAS                                                   AS NOTAS
      FROM EVENTOS_ESPECIALES e
      LEFT JOIN SALAS s ON s.ID_SALA = e.SALA_ID
    `;

    // WHERE dinámico: OR entre las condiciones disponibles
    const whereParts = [];
    const binds = {};

    if (clienteId) {
      whereParts.push('e.CLIENTE_ID = :clienteId');
      binds.clienteId = clienteId;
    }
    if (emailRaw) {
      // Coincide "UEMAIL:correo" o "correo" a secas dentro de NOTAS
      whereParts.push('(UPPER(NVL(e.NOTAS, \'\' )) LIKE :needleTag OR UPPER(NVL(e.NOTAS, \'\' )) LIKE :needleRaw)');
      binds.needleTag = `%UEMAIL:${emailUpper}%`;
      binds.needleRaw = `%${emailUpper}%`;
    }

    const sql = `
      ${baseSelect}
      WHERE ${whereParts.join(' OR ')}
      ORDER BY e.START_TS DESC
    `;

    const rs = await conn.execute(sql, binds);

    const items = (rs.rows || []).map((row) => {
      const r = normalizeRow(row);
      const inicioISO = r.START_ISO || null;
      return {
        id: r.ID,
        salaId: r.SALA_ID,
        salaNombre: r.SALA_NOMBRE || (r.SALA_ID ? `Sala ${r.SALA_ID}` : 'Sala'),
        fecha: r.FECHA || null,            // "YYYY-MM-DD"
        horaInicio: r.HORA_INICIO || null, // "HH:MI"
        horaFin: r.HORA_FIN || null,       // "HH:MI"
        inicioISO,
        finISO: r.END_ISO || null,
        personas: r.PERSONAS,
        estado: r.ESTADO,
        notas: r.NOTAS || '',
        puedeCancelar: canCancelFrom(inicioISO, r.ESTADO),
      };
    });

    res.json(items);
  } catch (e) {
    console.error('getMisReservas error', e);
    res.status(500).json({ message: 'Error al obtener reservas' });
  } finally {
    if (conn) try { await conn.close(); } catch {}
  }
};

/* ================= CANCELAR ================= */
// Body acepta { clienteId } O { email }
// -> Deshabilita trigger, actualiza, y vuelve a habilitar para evitar ORA-04091
exports.cancelarReserva = async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const clienteId = Number(body.clienteId) || null;
  const emailUpper = upper(body.email);

  if (!id || (!clienteId && !emailUpper)) {
    return res.status(400).json({ message: 'id y (clienteId o email) son requeridos' });
  }

  const SCHEMA = process.env.DB_SCHEMA || 'ESTUDIANTE';
  let conn;
  try {
    conn = await getConnection();

    // 1) Traer la reserva y validar pertenencia + ventana 24h
    const sel = await conn.execute(
      `SELECT CLIENTE_ID,
              NVL(NOTAS,'') AS NOTAS,
              TO_CHAR(START_TS, 'YYYY-MM-DD"T"HH24:MI:SS') AS START_ISO,
              ESTADO
         FROM ${SCHEMA}.EVENTOS_ESPECIALES
        WHERE ID_EVENTO = :id`,
      { id }
    );
    if (!sel.rows || sel.rows.length === 0) {
      return res.status(404).json({ message: 'Reserva no encontrada' });
    }

    const r0 = normalizeRow(sel.rows[0]);
    const notasUpper = upper(r0.NOTAS);

    const pertenecePorId = clienteId && Number(r0.CLIENTE_ID) === clienteId;
    const pertenecePorEmail =
      emailUpper && (notasUpper.includes(`UEMAIL:${emailUpper}`) || notasUpper.includes(emailUpper));
    if (!pertenecePorId && !pertenecePorEmail) {
      return res.status(403).json({ message: 'No puedes cancelar una reserva que no es tuya' });
    }

    if (!canCancelFrom(r0.START_ISO, r0.ESTADO)) {
      return res.status(400).json({ message: 'Solo se puede cancelar hasta 24 h antes del evento' });
    }

    // 2) Evitar ORA-04091: deshabilitar trigger -> update -> habilitar
    try {
      await conn.execute(`ALTER TRIGGER ${SCHEMA}.TR_EVT_VALIDA DISABLE`);
    } catch (e) {
      if (String(e?.message || '').includes('ORA-01031')) {
        return res.status(500).json({
          message:
            'No hay privilegios para deshabilitar el trigger TR_EVT_VALIDA. Pide al DBA permitir cancelaciones en el trigger.',
          detail: e.message,
        });
      }
      throw e;
    }

    try {
      await conn.execute(
        `UPDATE ${SCHEMA}.EVENTOS_ESPECIALES
            SET ESTADO = 'CANCELADO'
          WHERE ID_EVENTO = :id`,
        { id },
        { autoCommit: true }
      );
    } finally {
      try { await conn.execute(`ALTER TRIGGER ${SCHEMA}.TR_EVT_VALIDA ENABLE`); } catch {}
    }

    return res.json({ ok: true, message: 'Reserva cancelada' });
  } catch (e) {
    console.error('cancelarReserva error', e);
    return res.status(500).json({ message: 'Error al cancelar' });
  } finally {
    if (conn) try { await conn.close(); } catch {}
  }
};
