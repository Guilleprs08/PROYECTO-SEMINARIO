const router = require('express').Router();
const oracledb = require('oracledb');

// Utilidad: código HTTP para errores del trigger
const httpFromOracleError = (e) => {
  const triggerErrors = [20001, 20002, 20003, 20004];
  if (triggerErrors.includes(e?.errorNum)) return 400;
  return 500;
};

/* -------------------- SALAS -------------------- */
router.get('/salas', async (req, res) => {
  let conn;
  try {
    conn = await req.app.get('db').getConnection();
    const sql = `
      SELECT s.id_sala AS id, s.nombre, s.capacidad, s.formato
      FROM ESTUDIANTE.SALAS s
      ORDER BY s.id_sala
    `;
    const r = await conn.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    res.json(r.rows);
  } catch (e) {
    console.error('salas:', e);
    res.status(500).json({ message: 'No se pudieron cargar las salas.' });
  } finally { if (conn) try { await conn.close(); } catch {} }
});

/* ------------ helper: calcula start/end en SQL ------------ */
async function getStartEnd(conn, { fecha, horaInicio, duracionMin }) {
  const q = `
    SELECT
      CAST(TO_DATE(:fecha,'YYYY-MM-DD') AS TIMESTAMP)
        + NUMTODSINTERVAL( TO_NUMBER(SUBSTR(:hora,1,2))*60 + TO_NUMBER(SUBSTR(:hora,4,2)), 'MINUTE') AS START_TS,
      CAST(TO_DATE(:fecha,'YYYY-MM-DD') AS TIMESTAMP)
        + NUMTODSINTERVAL( TO_NUMBER(SUBSTR(:hora,1,2))*60 + TO_NUMBER(SUBSTR(:hora,4,2)) + :dur, 'MINUTE') AS END_TS
    FROM dual
  `;
  const r = await conn.execute(q,
    { fecha, hora: horaInicio, dur: Number(duracionMin) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return r.rows[0];
}

/* ------------ helper: verifica conflictos ------------ */
// NEW: usamos la misma lógica del trigger (FUNCIONES + EVENTOS)
async function hayConflicto(conn, { salaId, startTs, endTs }) {
  const q = `
    SELECT
      (
        SELECT COUNT(*)
        FROM (
          SELECT
            f.id_sala AS sala_id,
            CAST(TRUNC(f.fecha) AS TIMESTAMP) + f.hora_inicio AS inicio_ts,
            CAST(TRUNC(f.fecha) AS TIMESTAMP) + f.hora_final  AS fin_ts
          FROM ESTUDIANTE.FUNCIONES f
        ) x
        WHERE x.sala_id = :sala
          AND NOT (x.fin_ts <= :startTs OR x.inicio_ts >= :endTs)
      )
      +
      (
        SELECT COUNT(*)
        FROM ESTUDIANTE.EVENTOS_ESPECIALES e
        WHERE e.sala_id = :sala
          AND NVL(e.estado,'RESERVADO') <> 'CANCELADO'
          AND NOT (e.end_ts <= :startTs OR e.start_ts >= :endTs)
      ) AS conflictos
    FROM dual
  `;
  const r = await conn.execute(q,
    { sala: Number(salaId), startTs, endTs },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return r.rows[0].CONFLICTOS > 0;
}

/* -------------------- DISPONIBILIDAD -------------------- */
router.get('/disponibilidad', async (req, res) => {
  const { fecha, salaId, horaInicio, duracionMin } = req.query;
  if (!fecha || !salaId || !horaInicio || !duracionMin) {
    return res.status(400).json({ message: 'Parámetros incompletos' });
  }

  let conn;
  try {
    conn = await req.app.get('db').getConnection();
    const { START_TS, END_TS } = await getStartEnd(conn, { fecha, horaInicio, duracionMin });
    const conflict = await hayConflicto(conn, { salaId, startTs: START_TS, endTs: END_TS });
    res.json({ disponible: !conflict });
  } catch (e) {
    console.error('disponibilidad:', e);
    res.status(500).json({ message: 'Error verificando disponibilidad.' });
  } finally { if (conn) try { await conn.close(); } catch {} }
});

/* -------------------- RESERVAR -------------------- */
router.post('/reservar', async (req, res) => {
  const { salaId, fecha, horaInicio, duracionMin, personas, notas } = req.body || {};
  if (!salaId || !fecha || !horaInicio || !duracionMin) {
    return res.status(400).json({ message: 'Parámetros incompletos' });
  }

  let conn;
  try {
    conn = await req.app.get('db').getConnection();

    // NEW: verificación previa (si hay choque -> 409)
    const { START_TS, END_TS } = await getStartEnd(conn, { fecha, horaInicio, duracionMin });
    const conflict = await hayConflicto(conn, { salaId, startTs: START_TS, endTs: END_TS });
    if (conflict) {
      return res.status(409).json({ ok: false, message: 'La sala ya tiene una función o evento en ese horario.' });
    }

    // Insert protegido por trigger (3 días y solapes)
    const sql = `
      INSERT INTO ESTUDIANTE.EVENTOS_ESPECIALES
        (sala_id, start_ts, end_ts, duracion_min, personas, notas, estado)
      VALUES
        (:sala,
         :startTs,
         :endTs,
         :dur,
         :personas,
         :notas,
         'RESERVADO')
      RETURNING id_evento INTO :id
    `;
    const r = await conn.execute(sql, {
      sala: Number(salaId),
      startTs: START_TS,
      endTs: END_TS,
      dur: Number(duracionMin),
      personas: personas ? Number(personas) : null,
      notas,
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    }, { autoCommit: true });

    // fecha límite de pago = día anterior
    const id = r.outBinds.id[0];
    const pagoLimiteSql =
      `SELECT TO_CHAR((start_ts - NUMTODSINTERVAL(1,'DAY')),'YYYY-MM-DD') AS pago_limite
       FROM ESTUDIANTE.EVENTOS_ESPECIALES WHERE id_evento = :id`;
    const r2 = await conn.execute(pagoLimiteSql, { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

    res.json({ ok: true, id, pagoLimite: r2.rows[0].PAGO_LIMITE });
  } catch (e) {
    console.error('reservar:', e);
    res.status(httpFromOracleError(e)).json({ ok: false, message: e.message });
  } finally { if (conn) try { await conn.close(); } catch {} }
});

module.exports = router;
