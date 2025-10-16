// controllers/graficas reportes/ReportesdeSalas.controllers.js
/* Controlador de reportería de SALAS / OCUPACIÓN
   - Cálculo estricto basado en:
     SALAS(id_sala, nombre, capacidad, estado)
     FUNCIONES(id_funcion, id_sala, fecha, estado, precio)
     FUNCION_ASIENTO(id_funcion, id_asiento, estado, creado_en)
     ASIENTOS(id_asiento, id_sala, activo)
     COMPRAS(id_compra, id_funcion, monto_total, estado, fecha)
     ENTRADAS(id_entrada, id_compra, id_fa, estado)
   Estados contados como “ocupado”: ['OCUPADO','RESERVADO'].
   Cancelados/rehusados NO cuentan.
*/

const oracledb = require('oracledb');
const db = require('../../config/db'); // ajusta si tu config vive en otro lado

const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
// Estados que se consideran “ocupación efectiva” a nivel asiento
const ESTADOS_OCUPADOS = ['OCUPADO', 'RESERVADO'];

/* ============================
 * 1) KPI RESUMEN (encabezado)
 * ============================ */
exports.getKPIsSalas = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    // 1.1 Ocupación promedio últimos 15 días (ponderado por aforo de función)
    const qOcup15 = `
      WITH base AS (
        SELECT f.id_funcion,
               s.capacidad AS aforo,
               SUM(CASE WHEN fa.estado IN ('OCUPADO','RESERVADO') THEN 1 ELSE 0 END) AS ocupados
        FROM   funciones f
        JOIN   salas s            ON s.id_sala = f.id_sala AND s.estado = 'ACTIVA'
        LEFT   JOIN funcion_asiento fa ON fa.id_funcion = f.id_funcion
        WHERE  TRUNC(f.fecha) BETWEEN TRUNC(SYSDATE) - 14 AND TRUNC(SYSDATE)
        GROUP  BY f.id_funcion, s.capacidad
      )
      SELECT ROUND(100 * (SUM(ocupados) / NULLIF(SUM(aforo),0)), 1) AS pct_ocup_15d
      FROM base`;
    const rOcup15 = await cn.execute(qOcup15, {}, OUT_OBJ);

    // 1.2 Capacidad total (salas activas)
    const qCapTotal = `SELECT SUM(capacidad) AS capacidad_total
                       FROM salas
                       WHERE estado = 'ACTIVA'`;
    const rCapTotal = await cn.execute(qCapTotal, {}, OUT_OBJ);

    // 1.3 Asientos ocupados HOY
    const qOcupHoy = `
      SELECT COUNT(*) AS ocupados_hoy
      FROM   funcion_asiento fa
      JOIN   funciones f ON f.id_funcion = fa.id_funcion
      JOIN   salas s     ON s.id_sala = f.id_sala AND s.estado = 'ACTIVA'
      WHERE  TRUNC(f.fecha) = TRUNC(SYSDATE)
      AND    fa.estado IN ('OCUPADO','RESERVADO')`;
    const rOcupHoy = await cn.execute(qOcupHoy, {}, OUT_OBJ);

    // 1.4 Salas activas
    const qSalasAct = `SELECT COUNT(*) AS salas_activas
                       FROM salas
                       WHERE estado = 'ACTIVA'`;
    const rSalasAct = await cn.execute(qSalasAct, {}, OUT_OBJ);

    res.json({
      ocupacionPromedio15d: rOcup15.rows?.[0]?.PCT_OCUP_15D ?? 0,
      totalAsientos: rCapTotal.rows?.[0]?.CAPACIDAD_TOTAL ?? 0,
      asientosOcupadosHoy: rOcupHoy.rows?.[0]?.OCUPADOS_HOY ?? 0,
      salasActivas: rSalasAct.rows?.[0]?.SALAS_ACTIVAS ?? 0
    });
  } catch (err) {
    console.error('getKPIsSalas error:', err);
    res.status(500).json({ error: 'No se pudo calcular los KPIs' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};


/* =====================================
 * 2) Gráfica: Ocupación por Sala (hoy)
 *    - Capacidad = SALAS.capacidad
 *    - Ocupados  = asientos con estado OCUPADO/RESERVADO hoy
 * ===================================== */
exports.getOcupacionPorSalaHoy = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const q = `
      SELECT s.nombre AS sala,
             s.capacidad AS capacidad,
             NVL(SUM(CASE WHEN fa.estado IN ('OCUPADO','RESERVADO') THEN 1 ELSE 0 END),0) AS ocupados
      FROM   salas s
      LEFT   JOIN funciones f      ON f.id_sala = s.id_sala AND TRUNC(f.fecha) = TRUNC(SYSDATE)
      LEFT   JOIN funcion_asiento fa ON fa.id_funcion = f.id_funcion
      WHERE  s.estado = 'ACTIVA'
      GROUP  BY s.nombre, s.capacidad
      ORDER  BY s.nombre`;
    const r = await cn.execute(q, {}, OUT_OBJ);

    res.json(r.rows ?? []);
  } catch (err) {
    console.error('getOcupacionPorSalaHoy error:', err);
    res.status(500).json({ error: 'No se pudo obtener la ocupación por sala' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};


/* ======================================
 * 3) Gráfica: Tendencia Semanal (últimos 7 días)
 *    % = (ocupados / aforo) * 100
 * ====================================== */
exports.getTendenciaSemanal = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const q = `
      WITH d AS (
        SELECT TRUNC(f.fecha) AS dia,
               SUM(s.capacidad) AS aforo,
               SUM(CASE WHEN fa.estado IN ('OCUPADO','RESERVADO') THEN 1 ELSE 0 END) AS ocupados
        FROM   funciones f
        JOIN   salas s            ON s.id_sala = f.id_sala AND s.estado = 'ACTIVA'
        LEFT   JOIN funcion_asiento fa ON fa.id_funcion = f.id_funcion
        WHERE  TRUNC(f.fecha) BETWEEN TRUNC(SYSDATE) - 6 AND TRUNC(SYSDATE)
        GROUP  BY TRUNC(f.fecha)
      )
      SELECT dia,
             ROUND(100 * (ocupados / NULLIF(aforo,0)), 1) AS pct_ocupacion
      FROM d
      ORDER BY dia`;
    const r = await cn.execute(q, {}, OUT_OBJ);

    res.json(r.rows ?? []);
  } catch (err) {
    console.error('getTendenciaSemanal error:', err);
    res.status(500).json({ error: 'No se pudo obtener la tendencia semanal' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};


/* =======================================================
 * 4) Tabla: Detalle de Ocupación por Sala y Día (últ. 7d)
 *    - Capacidad = SALAS.capacidad (constante por sala)
 *    - Ocupados_dia = LEAST(conteo asientos ocupados/reservados, capacidad)
 *    - Disponibles  = capacidad - ocupados_dia
 *    - Estado badge: Alta ≥80%, Media 60–79%, Baja <60%
 * ======================================================= */
exports.getDetalleOcupacion = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const q = `
      WITH det AS (
        SELECT s.nombre AS sala,
               TRUNC(f.fecha) AS dia,
               s.capacidad    AS capacidad,
               LEAST(
                 NVL(SUM(CASE WHEN fa.estado IN ('OCUPADO','RESERVADO') THEN 1 ELSE 0 END),0),
                 s.capacidad
               ) AS ocupados
        FROM   salas s
        JOIN   funciones f       ON f.id_sala = s.id_sala
        LEFT   JOIN funcion_asiento fa ON fa.id_funcion = f.id_funcion
        WHERE  s.estado = 'ACTIVA'
          AND  TRUNC(f.fecha) BETWEEN TRUNC(SYSDATE) - 6 AND TRUNC(SYSDATE)
        GROUP  BY s.nombre, TRUNC(f.fecha), s.capacidad
      )
      SELECT sala,
             TO_CHAR(dia, 'DAY', 'NLS_DATE_LANGUAGE=SPANISH') AS dia_semana,
             capacidad,
             ocupados,
             (capacidad - ocupados) AS disponibles,
             ROUND(100 * (ocupados / NULLIF(capacidad,0)), 1) AS pct_ocupacion,
             CASE
               WHEN (ocupados / NULLIF(capacidad,0)) >= 0.80 THEN 'Alta'
               WHEN (ocupados / NULLIF(capacidad,0)) >= 0.60 THEN 'Media'
               ELSE 'Baja'
             END AS estado
      FROM det
      ORDER BY sala, dia`;
    const r = await cn.execute(q, {}, OUT_OBJ);

    res.json(r.rows ?? []);
  } catch (err) {
    console.error('getDetalleOcupacion error:', err);
    res.status(500).json({ error: 'No se pudo obtener el detalle de ocupación' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};


/* ==========================================================
 * 5) (Opcional) Ingresos por función/sala para enriquecer KPI
 *     basado en COMPRAS/ENTRADAS emitidas (no canceladas)
 * ========================================================== */
exports.getIngresosPorSalaHoy = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const q = `
      SELECT s.nombre AS sala,
             NVL(SUM(CASE WHEN c.estado = 'CONFIRMADA' THEN c.monto_total ELSE 0 END),0) AS ingresos_gtq
      FROM   salas s
      LEFT   JOIN funciones f ON f.id_sala = s.id_sala AND TRUNC(f.fecha) = TRUNC(SYSDATE)
      LEFT   JOIN compras c   ON c.id_funcion = f.id_funcion
      WHERE  s.estado = 'ACTIVA'
      GROUP  BY s.nombre
      ORDER  BY s.nombre`;
    const r = await cn.execute(q, {}, OUT_OBJ);

    res.json(r.rows ?? []);
  } catch (err) {
    console.error('getIngresosPorSalaHoy error:', err);
    res.status(500).json({ error: 'No se pudo obtener ingresos por sala' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};

// === KPIs por sala específica (sin tocar los endpoints existentes) ===
exports.getKPIsDeSala = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const salaId = Number(req.params.salaId || 0);
    if (!Number.isFinite(salaId) || salaId <= 0) {
      return res.status(400).json({ error: 'salaId inválido' });
    }

    // Capacidad (asientos totales) y estado de la sala
    const qSala = `
      SELECT capacidad AS capacidad, estado
      FROM salas
      WHERE id_sala = :salaId`;
    const rSala = await cn.execute(qSala, { salaId }, OUT_OBJ);
    const capacidad = rSala.rows?.[0]?.CAPACIDAD ?? 0;
    const estadoSala = rSala.rows?.[0]?.ESTADO ?? null;

    // Ocupación promedio últimos 15 días (ponderado por aforo de cada función de esa sala)
    const qOcup15 = `
      WITH base AS (
        SELECT f.id_funcion,
               :capacidad AS aforo,  -- la sala tiene aforo fijo
               SUM(CASE WHEN fa.estado IN ('OCUPADO','RESERVADO') THEN 1 ELSE 0 END) AS ocupados
        FROM   funciones f
        LEFT   JOIN funcion_asiento fa ON fa.id_funcion = f.id_funcion
        WHERE  f.id_sala = :salaId
          AND  TRUNC(f.fecha) BETWEEN TRUNC(SYSDATE) - 14 AND TRUNC(SYSDATE)
        GROUP  BY f.id_funcion
      )
      SELECT ROUND(100 * (SUM(ocupados) / NULLIF(SUM(aforo),0)), 1) AS pct_ocup_15d
      FROM base`;
    const rOcup15 = await cn.execute(qOcup15, { salaId, capacidad }, OUT_OBJ);

    // Asientos ocupados HOY en esa sala
    const qOcupHoy = `
      SELECT NVL(COUNT(*),0) AS ocupados_hoy
      FROM   funcion_asiento fa
      JOIN   funciones f ON f.id_funcion = fa.id_funcion
      WHERE  f.id_sala = :salaId
        AND  TRUNC(f.fecha) = TRUNC(SYSDATE)
        AND  fa.estado IN ('OCUPADO','RESERVADO')`;
    const rOcupHoy = await cn.execute(qOcupHoy, { salaId }, OUT_OBJ);

    // "Salas activas" para la vista por sala = 1 si está ACTIVA y 0 si no
    const salasActivas = (estadoSala === 'ACTIVA') ? 1 : 0;

    return res.json({
      ocupacionPromedio15d: rOcup15.rows?.[0]?.PCT_OCUP_15D ?? 0,
      totalAsientos: capacidad,
      asientosOcupadosHoy: rOcupHoy.rows?.[0]?.OCUPADOS_HOY ?? 0,
      salasActivas
    });
  } catch (err) {
    console.error('getKPIsDeSala error:', err);
    res.status(500).json({ error: 'No se pudo calcular los KPIs de la sala' });
  } finally {
    try { await cn?.close(); } catch {}
  }
};
