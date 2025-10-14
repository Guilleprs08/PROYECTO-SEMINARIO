// src/controllers/solicitudes.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

/* ===== Helpers fecha/hora (LOCAL) ===== */
const parseLocalDateTime = (yyyy_mm_dd, hh_mm) => {
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  const [hh, mm] = hh_mm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);
const toTs = (d) => new Date(d);

/* ===== Contexto de cliente ===== */
function getClienteContext(req) {
  // 👇 ahora también lee desde query string
  const clienteId = Number(
    req.headers['x-user-id'] ||
    req.body?.clienteId ||
    req.query?.clienteId ||
    0
  ) || null;

  const uemail =
    req.headers['x-user-email'] ||
    req.body?.email ||
    req.query?.email ||
    (() => {
      try {
        const raw = req.headers['x-mf-user'] || null;
        if (!raw) return null;
        const u = JSON.parse(raw);
        return u?.email || u?.correo || null;
      } catch {
        return null;
      }
    })();

  return { clienteId, uemail };
}

/* ========== POST /api/solicitudes ========== */
exports.crearSolicitud = async (req, res) => {
  const cn = await db.getConnection();
  try {
    const {
      salaId,
      fecha,        // "YYYY-MM-DD"
      horaInicio,   // "HH:mm"
      duracionMin,  // number
      personas,
      nombre,
      celular,
      notas,
    } = req.body;

    if (!salaId || !fecha || !horaInicio || !duracionMin) {
      return res.status(400).json({ ok:false, error:'FALTAN_CAMPOS' });
    }

    const { clienteId, uemail } = getClienteContext(req);

    const start = parseLocalDateTime(fecha, horaInicio);
    const end   = addMinutes(start, Number(duracionMin));

    const r = await cn.execute(
      `INSERT INTO ESTUDIANTE.SOLICITUDES_EVENTO
         (SALA_ID, START_TS, END_TS, DURACION_MIN, PERSONAS, NOMBRE, CELULAR, NOTAS, ESTADO, CLIENTE_ID, UEMAIL)
       VALUES
         (:p_sala, :p_start, :p_end, :p_dur, :p_pers, :p_nom, :p_cel, :p_notas, 'PENDIENTE', :p_cid, :p_uemail)
       RETURNING ID_SOLICITUD INTO :out_id`,
      {
        p_sala: Number(salaId),
        p_start: toTs(start),
        p_end: toTs(end),
        p_dur: Number(duracionMin),
        p_pers: personas ? Number(personas) : null,
        p_nom: nombre || null,
        p_cel: celular || null,
        p_notas: notas || null,
        p_cid: clienteId,
        p_uemail: uemail,
        out_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    return res.json({ ok:true, idSolicitud: r.outBinds.out_id[0], msg:'Solicitud enviada' });
  } catch (e) {
    console.error('crearSolicitud', e);
    return res.status(500).json({ ok:false, error:'ERR_CREAR_SOLICITUD', detail: e.message });
  } finally {
    try { await cn.close(); } catch {}
  }
};

/* ========== GET /api/solicitudes (admin) ========== */
exports.listarSolicitudes = async (req, res) => {
  const cn = await db.getConnection();
  try {
    const { estado } = req.query;
    const binds = {};
    let where = '';
    if (estado) { where = 'WHERE s.ESTADO = :estado'; binds.estado = String(estado).toUpperCase(); }

    const q = `
      SELECT s.ID_SOLICITUD, s.SALA_ID, s.START_TS, s.END_TS, s.DURACION_MIN, s.PERSONAS,
             s.NOMBRE, s.CELULAR, s.NOTAS, s.ESTADO, s.MOTIVO_RECHAZO,
             s.CLIENTE_ID, s.UEMAIL, s.EVENTO_ID, s.CREATED_AT
        FROM ESTUDIANTE.SOLICITUDES_EVENTO s
      ${where}
    ORDER BY s.ESTADO, s.CREATED_AT DESC`;
    const r = await cn.execute(q, binds);
    return res.json({ ok:true, items: r.rows });
  } catch (e) {
    console.error('listarSolicitudes', e);
    return res.status(500).json({ ok:false, error:'ERR_LISTAR_SOLICITUDES', detail: e.message });
  } finally {
    try { await cn.close(); } catch {}
  }
};

/* ========== GET /api/solicitudes/mis (cliente) ========== */
exports.misSolicitudes = async (req, res) => {
  const cn = await db.getConnection();
  try {
    const { estado } = req.query;
    const { clienteId, uemail } = getClienteContext(req);

    const binds = {};
    const conds = [];
    if (clienteId) { conds.push('s.CLIENTE_ID = :cid'); binds.cid = clienteId; }
    if (uemail)    { conds.push('(s.UEMAIL = :uemail OR s.NOTAS LIKE :tag)'); binds.uemail = uemail; binds.tag = `%[UEMAIL:${uemail}]%`; }
    if (!conds.length) conds.push('1=0');

    if (estado) { conds.push('s.ESTADO = :estado'); binds.estado = String(estado).toUpperCase(); }

    const q = `
      SELECT s.ID_SOLICITUD, s.SALA_ID, s.START_TS, s.END_TS, s.DURACION_MIN, s.PERSONAS,
             s.NOMBRE, s.CELULAR, s.NOTAS, s.ESTADO, s.MOTIVO_RECHAZO, s.EVENTO_ID, s.CREATED_AT
        FROM ESTUDIANTE.SOLICITUDES_EVENTO s
       WHERE ${conds.join(' AND ')}
    ORDER BY s.CREATED_AT DESC`;
    const r = await cn.execute(q, binds);
    return res.json({ ok:true, items: r.rows });
  } catch (e) {
    console.error('misSolicitudes', e);
    return res.status(500).json({ ok:false, error:'ERR_MIS_SOLICITUDES', detail: e.message });
  } finally {
    try { await cn.close(); } catch {}
  }
};

/* ========== PATCH /api/solicitudes/:id/aprobar (admin) ========== */
exports.aprobarSolicitud = async (req, res) => {
  const cn = await db.getConnection();
  try {
    const { id } = req.params;

    const r1 = await cn.execute(
      `SELECT * FROM ESTUDIANTE.SOLICITUDES_EVENTO WHERE ID_SOLICITUD = :p_id FOR UPDATE`,
      { p_id: Number(id) }
    );
    if (!r1.rows.length) return res.status(404).json({ ok:false, error:'NO_ENCONTRADA' });

    const s = r1.rows[0];
    if (s.ESTADO !== 'PENDIENTE') {
      return res.status(400).json({ ok:false, error:'ESTADO_INVALIDO', detail:`Estado actual: ${s.ESTADO}` });
    }

    const r2 = await cn.execute(
      `INSERT INTO ESTUDIANTE.EVENTOS_ESPECIALES
         (SALA_ID, START_TS, END_TS, DURACION_MIN, PERSONAS, NOTAS, ESTADO, CLIENTE_ID, CREATED_AT)
       VALUES
         (:p_sala, :p_start, :p_end, :p_dur, :p_pers, :p_notas, 'RESERVADO', :p_cid, SYSTIMESTAMP)
       RETURNING ID_EVENTO INTO :out_evt`,
      {
        p_sala: s.SALA_ID,
        p_start: s.START_TS,
        p_end: s.END_TS,
        p_dur: s.DURACION_MIN,
        p_pers: s.PERSONAS,
        p_notas: s.NOTAS,
        p_cid: s.CLIENTE_ID,
        out_evt: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    const idEvento = r2.outBinds.out_evt[0];

    await cn.execute(
      `UPDATE ESTUDIANTE.SOLICITUDES_EVENTO
          SET ESTADO='ACEPTADA', EVENTO_ID=:p_evt
        WHERE ID_SOLICITUD = :p_id`,
      { p_evt: idEvento, p_id: Number(id) }
    );

    await cn.commit();
    return res.json({ ok:true, idEvento, msg:'Solicitud aprobada y evento creado' });
  } catch (e) {
    await cn.rollback();
    console.error('aprobarSolicitud', e);
    return res.status(400).json({ ok:false, error:'ERR_APROBAR', detail: e.message });
  } finally {
    try { await cn.close(); } catch {}
  }
};

/* ========== PATCH /api/solicitudes/:id/rechazar (admin) ========== */
exports.rechazarSolicitud = async (req, res) => {
  const cn = await db.getConnection();
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const r1 = await cn.execute(
      `SELECT ESTADO FROM ESTUDIANTE.SOLICITUDES_EVENTO WHERE ID_SOLICITUD = :p_id FOR UPDATE`,
      { p_id: Number(id) }
    );
    if (!r1.rows.length) return res.status(404).json({ ok:false, error:'NO_ENCONTRADA' });
    if (r1.rows[0].ESTADO !== 'PENDIENTE') {
      return res.status(400).json({ ok:false, error:'ESTADO_INVALIDO' });
    }

    await cn.execute(
      `UPDATE ESTUDIANTE.SOLICITUDES_EVENTO
          SET ESTADO='RECHAZADA', MOTIVO_RECHAZO=:p_motivo
        WHERE ID_SOLICITUD = :p_id`,
      { p_motivo: motivo || 'Sin especificar', p_id: Number(id) }
    );

    await cn.commit();
    return res.json({ ok:true, msg:'Solicitud rechazada' });
  } catch (e) {
    await cn.rollback();
    console.error('rechazarSolicitud', e);
    return res.status(500).json({ ok:false, error:'ERR_RECHAZAR', detail: e.message });
  } finally {
    try { await cn.close(); } catch {}
  }
};
