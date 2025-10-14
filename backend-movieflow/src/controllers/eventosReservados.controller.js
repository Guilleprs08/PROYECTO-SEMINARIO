// controllers/eventosReservados.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

/* ================== Helpers fecha/hora (LOCAL) ================== */
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const pad2 = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const parseLocalDateTime = (yyyy_mm_dd, hh_mm) => {
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  const [hh, mm] = hh_mm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const getConnection = async () => (db.getConnection ? db.getConnection() : db);

/* ================== Utilidades ================== */
function parseInputDate(str) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const t = new Date(str);
  if (Number.isNaN(t.getTime())) throw new Error('Fecha inválida');
  t.setHours(0, 0, 0, 0);
  return t;
}

/* =================================================================
   Lectores y parsers unificados (soporta IntervalDS / Date / Varchar2)
   ================================================================= */
const parseHoraMin = (v) => {
  // IntervalDS de oracledb
  if (v && typeof v === 'object' && 'hours' in v && 'minutes' in v && 'days' in v) {
    return (Number(v.days) || 0) * 1440 + (Number(v.hours) || 0) * 60 + (Number(v.minutes) || 0);
  }
  if (v instanceof Date && !Number.isNaN(v)) return v.getHours() * 60 + v.getMinutes();
  const s = String(v ?? '').trim();
  let m = s.match(/(\d{1,2}):(\d{2})/); if (m) return (+m[1]) * 60 + (+m[2]);
  m = s.match(/^(\d{1,2})(\d{2})$/);    if (m) return (+m[1]) * 60 + (+m[2]);
  return null;
};

// FUNCIONES del día por sala (filtra por TRUNC(FECHA)=TRUNC(:dayStart))
async function _fetchFuncionesDiaSala(conn, salaId, dayStart) {
  const base = (colSala) => `
    SELECT FECHA, HORA_INICIO, HORA_FINAL, NVL(ESTADO,'VIGENTE') AS ESTADO
      FROM ESTUDIANTE.FUNCIONES F
     WHERE F.${colSala} = :sid
       AND TRUNC(F.FECHA) = TRUNC(:dayStart)
  `;
  const binds = { sid: Number(salaId), dayStart };
  try { return (await conn.execute(base('SALA_ID'), binds)).rows || []; }
  catch (e) { if (!String(e.message).includes('ORA-00904')) throw e; }
  try { return (await conn.execute(base('ID_SALA'), binds)).rows || []; }
  catch (e) { if (!String(e.message).includes('ORA-00904')) throw e; }
  try { return (await conn.execute(base('SALA'), binds)).rows || []; }
  catch (e) { throw e; }
}

// EVENTOS con solape respecto a [startTs, endTs)
async function _fetchEventosSolape(conn, salaId, startTs, endTs) {
  const base = (colSala) => `
    SELECT START_TS, END_TS, NVL(ESTADO,'RESERVADO') AS ESTADO
      FROM ESTUDIANTE.EVENTOS_ESPECIALES E
     WHERE E.${colSala} = :sid
       AND UPPER(TRIM(NVL(E.ESTADO,'RESERVADO'))) <> 'CANCELADO'
       AND NOT (E.END_TS <= :startTs OR E.START_TS >= :endTs)
  `;
  const binds = { sid: Number(salaId), startTs, endTs };
  try { return (await conn.execute(base('SALA_ID'), binds)).rows || []; }
  catch (e) { if (!String(e.message).includes('ORA-00904')) throw e; }
  try { return (await conn.execute(base('ID_SALA'), binds)).rows || []; }
  catch (e) { if (!String(e.message).includes('ORA-00904')) throw e; }
  try { return (await conn.execute(base('SALA'), binds)).rows || []; }
  catch (e) { throw e; }
}

/* ========= Contadores de solape usados por disponibilidad/crear ======== */
async function contarSolapeFunciones(conn, { salaId, startTs, endTs }) {
  const sMin = startTs.getHours() * 60 + startTs.getMinutes();
  const eMin = endTs.getHours() * 60 + endTs.getMinutes();
  const rows = await _fetchFuncionesDiaSala(conn, salaId, startOfDay(startTs));
  let cnt = 0;
  for (const r of rows) {
    const est = String(r.ESTADO || '').toUpperCase();
    if (est.startsWith('CANCEL')) continue;
    const ini = parseHoraMin(r.HORA_INICIO ?? r.hora_inicio);
    const fin = parseHoraMin(r.HORA_FINAL  ?? r.hora_final);
    if (Number.isFinite(ini) && Number.isFinite(fin)) {
      if (!(fin <= sMin || ini >= eMin)) cnt++;
    }
  }
  return cnt;
}
async function contarSolapeEventos(conn, { salaId, startTs, endTs }) {
  const rows = await _fetchEventosSolape(conn, salaId, startTs, endTs);
  return rows.length;
}

/* ================== 1) DISPONIBILIDAD ================== */
async function disponibilidad(req, res) {
  const { salaId, fecha, horaInicio, duracionMin } = req.query;
  if (!salaId || !fecha || !horaInicio || !duracionMin) {
    return res.status(400).json({ message: 'salaId, fecha, horaInicio y duracionMin son obligatorios.' });
  }

  const startTs = parseLocalDateTime(fecha, horaInicio);
  const endTs   = new Date(startTs.getTime() + Number(duracionMin) * 60 * 1000);

  let conn;
  try {
    conn = await getConnection();
    const params = { salaId: Number(salaId), startTs, endTs };

    const cntFunc = await contarSolapeFunciones(conn, params);
    if (cntFunc > 0) return res.json({ disponible: false, reason: 'funcion' });

    const cntEvt = await contarSolapeEventos(conn, params);
    if (cntEvt > 0) return res.json({ disponible: false, reason: 'evento' });

    const eventDay = startOfDay(startTs);
    const minDay = startOfDay(new Date()); minDay.setDate(minDay.getDate() + 3);
    if (eventDay < minDay) return res.json({ disponible: false, reason: 'min3dias', minDay: ymd(minDay) });

    return res.json({ disponible: true });
  } catch (e) {
    console.error('disponibilidad eventos error:', e);
    return res.status(500).json({ message: 'Error al verificar disponibilidad', detail: e.message ?? String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 2) CREAR ================== */
async function crearEventoReservado(req, res) {
  const { salaId, fecha, horaInicio, duracionMin, personas, notas, clienteId, email } = req.body;
  if (!salaId || !fecha || !horaInicio || !duracionMin) {
    return res.status(400).json({ message: 'salaId, fecha, horaInicio y duracionMin son obligatorios.' });
  }

  const startTs = parseLocalDateTime(fecha, horaInicio);
  const endTs   = new Date(startTs.getTime() + Number(duracionMin) * 60 * 1000);

  const emailTrim   = String(email || '').trim();
  const notasDB     = emailTrim ? `${notas || ''} [UEMAIL:${emailTrim}]` : (notas || null);
  const clienteIdDB = clienteId ? Number(clienteId) : null;

  let conn;
  try {
    conn = await getConnection();

    const params = { salaId: Number(salaId), startTs, endTs };
    if (await contarSolapeFunciones(conn, params))
      return res.status(409).json({ message: 'La sala ya tiene una función en ese horario.' });
    if (await contarSolapeEventos(conn, params))
      return res.status(409).json({ message: 'La sala ya está reservada para un evento en ese horario.' });

    const eventDay = startOfDay(startTs);
    const minDay = startOfDay(new Date()); minDay.setDate(minDay.getDate() + 3);
    if (eventDay < minDay)
      return res.status(400).json({ message: 'Debes reservar con mínimo 3 días de anticipación.', minDay: ymd(minDay) });

    await conn.execute(
      `INSERT INTO ESTUDIANTE.EVENTOS_ESPECIALES
         (SALA_ID, START_TS, END_TS, DURACION_MIN, PERSONAS, NOTAS, ESTADO, CLIENTE_ID)
       VALUES
         (:salaId, :startTs, :endTs, :duracionMin, :personas, :notas, 'RESERVADO', :clienteId)`,
      {
        salaId: Number(salaId),
        startTs,
        endTs,
        duracionMin: Number(duracionMin),
        personas: personas ? Number(personas) : null,
        notas: notasDB,
        clienteId: clienteIdDB
      },
      { autoCommit: true }
    );

    const pagoLimite = ymd(new Date(eventDay.getTime() - 24 * 3600 * 1000));
    return res.json({ ok: true, pagoLimite });
  } catch (e) {
    console.error('crearEventoReservado error:', e);
    return res.status(500).json({ message: 'No se pudo crear la reserva', detail: String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 3) LISTAR (ADMIN / HISTORIAL) ================== */
async function listarEventosReservados(req, res) {
  const showAll = String(req.query.all || '').trim() === '1';
  const { fecha } = req.query;
  let conn;

  const base = (salaIdCol = 'ID', where = '', order = 'ORDER BY E.CREATED_AT DESC NULLS LAST') => `
    SELECT E.ID_EVENTO,
           E.SALA_ID,
           S.NOMBRE AS SALA_NOMBRE,
           E.START_TS,
           E.END_TS,
           E.DURACION_MIN,
           E.PERSONAS,
           E.NOTAS,
           E.ESTADO,
           E.CLIENTE_ID,
           E.CREATED_AT
      FROM ESTUDIANTE.EVENTOS_ESPECIALES E
 LEFT JOIN ESTUDIANTE.SALAS S
        ON S.${salaIdCol} = E.SALA_ID
     ${where}
     ${order}`;

  try {
    conn = await getConnection();

    // Auto-finalizar vencidos
    await conn.execute(
      `UPDATE ESTUDIANTE.EVENTOS_ESPECIALES E
          SET E.ESTADO = 'FINALIZADO'
        WHERE E.END_TS <= SYSTIMESTAMP
          AND UPPER(TRIM(NVL(E.ESTADO,'RESERVADO'))) = 'RESERVADO'`,
      {},
      { autoCommit: true }
    );

    if (fecha) {
      let dayStart;
      try { dayStart = parseInputDate(fecha); }
      catch { return res.status(400).json({ message: 'Formato de fecha inválido. Usa YYYY-MM-DD o DD/MM/YYYY.' }); }
      const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);

      const whereDia = `WHERE E.START_TS >= :dayStart AND E.START_TS < :dayEnd`;
      const orderDia = `ORDER BY E.START_TS ASC`;
      const binds = { dayStart, dayEnd };

      try {
        const r = await conn.execute(base('ID', whereDia, orderDia), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return res.json(r.rows || []);
      } catch (e1) {
        if (String(e1.message).includes('ORA-00904')) {
          const r2 = await conn.execute(base('ID_SALA', whereDia, orderDia), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
          return res.json(r2.rows || []);
        }
        throw e1;
      }
    }

    const whereAllOrReserved = showAll ? '' : `WHERE UPPER(TRIM(NVL(E.ESTADO,'RESERVADO'))) = 'RESERVADO'`;

    try {
      const r = await conn.execute(base('ID', whereAllOrReserved), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return res.json(r.rows || []);
    } catch (e1) {
      if (String(e1.message).includes('ORA-00904')) {
        const r2 = await conn.execute(base('ID_SALA', whereAllOrReserved), {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return res.json(r2.rows || []);
      }
      throw e1;
    }
  } catch (e) {
    console.error('listarEventosReservados error:', e);
    return res.status(500).json({ message: 'Error al listar eventos', detail: e.message ?? String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 3.1) LISTAR MIS RESERVAS (CLIENTE) ================== */
async function listarMisEventos(req, res) {
  let conn;
  try {
    conn = await getConnection();

    const clienteId = req.query.clienteId ? Number(req.query.clienteId) : null;
    const emailRaw  = String(req.query.email || '').trim();
    const email     = emailRaw || null;

    console.log('[mis] clienteId=', clienteId, ' email=', email);

    if (!clienteId && !email) return res.status(400).json({ message: 'Falta clienteId o email.' });

    const binds = {};
    const conds = [];
    if (clienteId) { conds.push('E.CLIENTE_ID = :clienteId'); binds.clienteId = clienteId; }
    if (email)     { conds.push('INSTR(UPPER(NVL(E.NOTAS,\'\')), :tag) > 0'); binds.tag = `[UEMAIL:${email.toUpperCase()}]`; }
    const where = `WHERE ${conds.join(' OR ')}`;

    const base = (salaIdCol = 'ID') => `
      SELECT E.ID_EVENTO,
             E.SALA_ID,
             S.NOMBRE AS SALA_NOMBRE,
             E.START_TS, E.END_TS, E.DURACION_MIN,
             E.PERSONAS, E.NOTAS, E.ESTADO, E.CLIENTE_ID, E.CREATED_AT
        FROM ESTUDIANTE.EVENTOS_ESPECIALES E
   LEFT JOIN ESTUDIANTE.SALAS S
          ON S.${salaIdCol} = E.SALA_ID
       ${where}
    ORDER BY E.START_TS DESC`;

    try {
      const r = await conn.execute(base('ID'), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return res.json(r.rows || []);
    } catch (e1) {
      if (String(e1.message).includes('ORA-00904')) {
        const r2 = await conn.execute(base('ID_SALA'), binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return res.json(r2.rows || []);
      }
      throw e1;
    }
  } catch (e) {
    console.error('listarMisEventos error:', e);
    return res.status(500).json({ message: 'Error al listar mis reservas', detail: e.message ?? String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 4) ACTUALIZAR ================== */
async function actualizarEventoReservado(req, res) {
  const { id } = req.params;
  const { salaId, fecha, horaInicio, duracionMin, personas, notas, estado } = req.body;
  if (!id) return res.status(400).json({ message: 'id requerido' });

  let startTs = null, endTs = null;
  if (fecha && horaInicio && duracionMin) {
    const s = parseLocalDateTime(fecha, horaInicio);
    startTs = s;
    endTs = new Date(s.getTime() + Number(duracionMin) * 60 * 1000);
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `UPDATE ESTUDIANTE.EVENTOS_ESPECIALES
          SET
            SALA_ID      = COALESCE(:salaId, SALA_ID),
            START_TS     = COALESCE(:startTs, START_TS),
            END_TS       = COALESCE(:endTs, END_TS),
            DURACION_MIN = COALESCE(:duracionMin, DURACION_MIN),
            PERSONAS     = COALESCE(:personas, PERSONAS),
            NOTAS        = COALESCE(:notas, NOTAS),
            ESTADO       = COALESCE(:estado, ESTADO)
        WHERE ID_EVENTO   = :id`,
      {
        id: Number(id),
        salaId: salaId ? Number(salaId) : null,
        startTs,
        endTs,
        duracionMin: duracionMin ? Number(duracionMin) : null,
        personas: personas ? Number(personas) : null,
        notas: notas || null,
        estado: estado || null,
      },
      { autoCommit: true }
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('actualizarEventoReservado error:', e);
    return res.status(500).json({ message: 'No se pudo actualizar el evento', detail: e.message ?? String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 5) CANCELAR ================== */
async function cancelarEventoReservado(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: 'id requerido' });

  let conn;
  try {
    conn = await getConnection();

    try {
      await conn.execute(`BEGIN ESTUDIANTE.PR_EVT_CANCELAR(:id); END;`, { id: Number(id) }, { autoCommit: true });
      return res.json({ ok: true, via: 'SP' });
    } catch (spErr) {
      await conn.execute(
        `UPDATE ESTUDIANTE.EVENTOS_ESPECIALES
            SET ESTADO = 'CANCELADO'
          WHERE ID_EVENTO = :id`,
        { id: Number(id) },
        { autoCommit: true }
      );
      return res.json({ ok: true, via: 'UPDATE' });
    }
  } catch (e) {
    console.error('cancelarEventoReservado error:', e);
    return res.status(500).json({ message: 'No se pudo cancelar el evento', detail: e.message ?? String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

/* ================== 6) SLOTS DISPONIBLES ================== */
async function obtenerSlots(req, res) {
  const { salaId, fecha, duracionMin = '120', open = '10:00', close = '22:00', stepMin = '30' } = req.query;
  if (!salaId || !fecha) return res.status(400).json({ message: 'salaId y fecha son obligatorios.' });

  const salaNum = Number(salaId);

  // --- día seleccionado ---
  let dayStart;
  try { dayStart = parseInputDate(fecha); }
  catch { return res.status(400).json({ message: 'Formato de fecha inválido. Usa YYYY-MM-DD o DD/MM/YYYY.' }); }
  const y = dayStart.getFullYear(), m = dayStart.getMonth() + 1, d = dayStart.getDate();
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // --- ventana y malla ---
  const dur  = Math.max(1, Number(duracionMin) || 120);
  const step = Math.max(1, Number(stepMin)     || 30);
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const openMin  = oh*60 + (om || 0);
  const closeMin = ch*60 + (cm || 0);
  const toHM = (mins) => `${pad2(Math.floor(mins/60))}:${pad2(mins%60)}`;
  const roundDown = (mins) => Math.floor(mins/step)*step;
  const roundUp   = (mins) => Math.ceil(mins/step)*step;

  const minDay = startOfDay(new Date()); minDay.setDate(minDay.getDate() + 3);
  const allowReserve = startOfDay(dayStart) >= minDay;

  let conn;
  try {
    conn = await getConnection();

    // 1) traer funciones/eventos
    const funRows = await _fetchFuncionesDiaSala(conn, salaNum, dayStart);
    const evtRows = await _fetchEventosSolape(conn, salaNum, dayStart, nextDay);

    console.log('[DEBUG] funciones filas:', funRows.length, funRows[0] || null);
    console.log('[DEBUG] eventos   filas:', evtRows.length, evtRows[0] || null);

    // 2) convertir a minutos (del día)
    const funMin = [];
    for (const r of funRows) {
      const est = String(r.ESTADO || '').toUpperCase();
      if (est.startsWith('CANCEL')) continue;
      const ini = parseHoraMin(r.HORA_INICIO ?? r.hora_inicio);
      const fin = parseHoraMin(r.HORA_FINAL  ?? r.hora_final);
      if (Number.isFinite(ini) && Number.isFinite(fin)) funMin.push({ ini, fin, tipo: 'funcion' });
    }
    const evtMin = [];
    for (const e of evtRows) {
      const s = (e.START_TS instanceof Date) ? e.START_TS : new Date(e.START_TS);
      const t = (e.END_TS   instanceof Date) ? e.END_TS   : new Date(e.END_TS);
      if (Number.isNaN(s) || Number.isNaN(t)) continue;
      evtMin.push({ ini: s.getHours()*60 + s.getMinutes(), fin: t.getHours()*60 + t.getMinutes(), tipo: 'evento' });
    }

    console.log('[DEBUG] funMin (RAW->DAY):', funMin);
    console.log('[DEBUG] evtMin (RAW->DAY):', evtMin);

    // 3) redondeo + merge
    const ocupadosMin = [];
    for (const f of funMin) {
      const s = Math.max(openMin, roundDown(f.ini));
      const e = Math.min(closeMin, roundUp(f.fin));
      if (e > s) ocupadosMin.push({ ini: s, fin: e, tipo: f.tipo });
    }
    for (const ev of evtMin) {
      const s = Math.max(openMin, roundDown(ev.ini));
      const e = Math.min(closeMin, roundUp(ev.fin));
      if (e > s) ocupadosMin.push({ ini: s, fin: e, tipo: ev.tipo });
    }
    ocupadosMin.sort((a,b) => a.ini - b.ini);
    const merged = [];
    for (const r of ocupadosMin) {
      if (!merged.length || r.ini > merged[merged.length - 1].fin) merged.push({ ...r });
      else merged[merged.length - 1].fin = Math.max(merged[merged.length - 1].fin, r.fin);
    }
    console.log('[DEBUG] merged ocupados:', merged);

    // 4) slots libres
    const starts = [];
    for (let s = openMin; s + dur <= closeMin; s += step) {
      const e = s + dur;
      const overlap = merged.some(b => s < b.fin && e > b.ini);
      if (!overlap) starts.push(s);
    }

    return res.json({
      salaId: salaNum,
      fecha: `${y}-${pad2(m)}-${pad2(d)}`,
      open, close,
      stepMin: step,
      duracionMin: dur,
      allowReserve,
      minDay: ymd(minDay),
      disponibles: starts.map(toHM),
      ocupados: merged.map(r => ({ start: toHM(r.ini), end: toHM(r.fin), tipo: r.tipo })),
    });
  } catch (e) {
    console.error('obtenerSlots error:', e);
    return res.status(500).json({ message: 'No se pudieron calcular los horarios', detail: e?.message || String(e) });
  } finally {
    try { await conn?.close(); } catch {}
  }
}

module.exports = {
  disponibilidad,
  crearEventoReservado,
  listarEventosReservados,
  listarMisEventos,
  actualizarEventoReservado,
  cancelarEventoReservado,
  obtenerSlots,
};
