// src/controllers/reportes/ventasSnacks.controller.js
const oracledb = require('oracledb');
const db = require('../../config/db'); // <= tu helper: getConnection()
const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/* =========================
 * Helpers de fecha (GT -06:00)
 * ========================= */

/** Convierte "DD/MM/YYYY" a Date (00:00:00 local) y valida formato. */
function parseDDMMYYYY(s) {
  if (typeof s !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    return { error: 'Formato de fecha inválido. Usa DD/MM/YYYY.' };
  }
  const [dd, mm, yyyy] = s.split('/').map(Number);
  const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0); // local time
  // Validación estricta (por si "32/10/2025" etc.)
  if (d.getFullYear() !== yyyy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) {
    return { error: 'Fecha no válida.' };
  }
  return { date: d };
}

/** Primer día del mes de una fecha (00:00). */
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
/** Último día del mes de una fecha (23:59:59.999) — aunque usaremos ventana exclusiva. */
function lastOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
/** D+N días. */
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 0, 0, 0, 0); }
/** Desplaza un mes conservando día cuando sea posible (si no, cae al último del mes). */
function addMonthsClamp(d, delta) {
  const y = d.getFullYear(), m0 = d.getMonth(), day = d.getDate();
  const target = new Date(y, m0 + delta, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(day, last);
  return new Date(target.getFullYear(), target.getMonth(), clampedDay, 0, 0, 0, 0);
}

/** Verifica que [desde,hasta] está dentro del mes actual y desde<=hasta. */
function validateCurrentMonthRange(desde, hasta) {
  const now = new Date(); // America/Guatemala (servidor puede estar UTC; lógica usa calendario)
  const mNow = new Date(now.getFullYear(), now.getMonth(), 1);
  const mNowEnd = lastOfMonth(now);
  // Deben pertenecer al mismo mes y año
  if (desde.getFullYear() !== hasta.getFullYear() || desde.getMonth() !== hasta.getMonth()) {
    return 'El rango debe estar dentro del mismo mes.';
  }
  // Deben estar en el mes actual
  if (desde < firstOfMonth(now) || hasta > mNowEnd) {
    return 'Solo se permite el mes actual.';
  }
  if (desde > hasta) return 'La fecha "desde" no puede ser mayor que "hasta".';
  return null;
}

/* =========================
 * Consultas SQL (bind-safe)
 * ========================= */

/* Snacks en caja (detalle de productos, no combos) */
const SQL_SNACKS_CAJA = `
  SELECT NVL(SUM(d.SUBTOTAL_LINEA), 0) AS TOTAL
  FROM POS_VENTAS v
  JOIN POS_DETALLE_VENTA d ON d.ID_VENTA = v.ID_VENTA
  WHERE v.FECHA >= :d AND v.FECHA < :h_exc
`;

/* Combos en caja (líneas de combos) */
const SQL_COMBOS_CAJA = `
  SELECT NVL(SUM(c.SUBTOTAL_LINEA), 0) AS TOTAL
  FROM POS_VENTAS v
  JOIN POS_VENTA_COMBO c ON c.ID_VENTA = v.ID_VENTA
  WHERE v.FECHA >= :d AND v.FECHA < :h_exc
`;

/* Snacks por cliente (ventas cerradas del cliente) */
const SQL_SNACKS_CLIENTE = `
  SELECT NVL(SUM(d.SUBTOTAL_GTQ), 0) AS TOTAL
  FROM POS_VENTA_SNACK_CLI v
  JOIN POS_VENTA_SNACK_CLI_DET d ON d.VENTA_ID = v.ID_VENTA
  WHERE v.CREATED_AT >= :d AND v.CREATED_AT < :h_exc
    AND d.ITEM_TIPO = 'PRODUCTO'
`;

// Nota sobre estados:
// - Si gestionas estados en POS_VENTAS (ANULADA/CANCELADA/etc.), añade un filtro extra.
//   Ejemplo (ajústalo a tus nombres reales):
//   AND v.ESTADO_ID IN (SELECT ID_ESTADO FROM POS_ESTADO_VENTA WHERE NOMBRE IN ('PAGADA','COMPLETADA'))
// - Para canal cliente, usamos la tabla de venta cerrada (POS_VENTA_SNACK_CLI); no usamos PEDIDOS.

/* =========================
 * Formato de respuesta
 * ========================= */
function calcShare(t, totalG) {
  return totalG > 0 ? Number((100 * t / totalG).toFixed(1)) : 0;
}
function calcMoM(actual, previo) {
  if (previo <= 0) return null; // mostrar “—” en frontend
  return Number((100 * (actual - previo) / previo).toFixed(1));
}

/* =========================
 * Controller principal
 * ========================= */
exports.getVentasSnacks = async (req, res) => {
  try {
    const { desde: sDesde, hasta: sHasta } = req.query;

    // 1) Parseo
    const pD = parseDDMMYYYY(sDesde);
    const pH = parseDDMMYYYY(sHasta);
    if (pD.error || pH.error) {
      return res.status(400).json({ ok: false, error: pD.error || pH.error });
    }
    const dDesde = pD.date;
    const dHasta = pH.date;

    // 2) Validación de rango (mismo mes + mes actual)
    const vErr = validateCurrentMonthRange(dDesde, dHasta);
    if (vErr) return res.status(400).json({ ok: false, error: vErr });

    // 3) Ventanas inclusiva/exclusiva
    const hastaExc = addDays(dHasta, 1); // [desde, hasta+1)
    // Ventana previa (mismo tamaño, -1 mes)
    const prevDesde = addMonthsClamp(dDesde, -1);
    const prevHasta = addMonthsClamp(dHasta, -1);
    const prevHastaExc = addDays(prevHasta, 1);

    // 4) Ejecutar consultas
    const cn = await db.getConnection(); // patrón que ya usas
    try {
      // Actual
      const [rSnackCaja] = (await cn.execute(SQL_SNACKS_CAJA, { d: dDesde, h_exc: hastaExc }, OUT_OBJ)).rows;
      const [rCombCaja]  = (await cn.execute(SQL_COMBOS_CAJA, { d: dDesde, h_exc: hastaExc }, OUT_OBJ)).rows;
      const [rSnackCli]  = (await cn.execute(SQL_SNACKS_CLIENTE, { d: dDesde, h_exc: hastaExc }, OUT_OBJ)).rows;

      const snacksCaja   = Number(rSnackCaja?.TOTAL || 0);
      const combosCaja   = Number(rCombCaja?.TOTAL || 0);
      const snacksCliente= Number(rSnackCli?.TOTAL || 0);
      const totalGeneral = snacksCaja + combosCaja + snacksCliente;

      // Previo
      const [pSnackCaja] = (await cn.execute(SQL_SNACKS_CAJA, { d: prevDesde, h_exc: prevHastaExc }, OUT_OBJ)).rows;
      const [pCombCaja]  = (await cn.execute(SQL_COMBOS_CAJA, { d: prevDesde, h_exc: prevHastaExc }, OUT_OBJ)).rows;
      const [pSnackCli]  = (await cn.execute(SQL_SNACKS_CLIENTE, { d: prevDesde, h_exc: prevHastaExc }, OUT_OBJ)).rows;

      const snacksCajaPrev    = Number(pSnackCaja?.TOTAL || 0);
      const combosCajaPrev    = Number(pCombCaja?.TOTAL || 0);
      const snacksClientePrev = Number(pSnackCli?.TOTAL || 0);
      const totalGeneralPrev  = snacksCajaPrev + combosCajaPrev + snacksClientePrev;

      // Shares
      const shareSnacksCaja    = calcShare(snacksCaja, totalGeneral);
      const shareCombosCaja    = calcShare(combosCaja, totalGeneral);
      const shareSnacksCliente = calcShare(snacksCliente, totalGeneral);

      // MoM por categoría
      const momSnacksCaja    = calcMoM(snacksCaja, snacksCajaPrev);
      const momCombosCaja    = calcMoM(combosCaja, combosCajaPrev);
      const momSnacksCliente = calcMoM(snacksCliente, snacksClientePrev);
      const momTotalGeneral  = calcMoM(totalGeneral, totalGeneralPrev);

      // Respuesta
      return res.json({
        ok: true,
        rango: {
          desde: sDesde,
          hasta: sHasta,
          prev_desde: `${String(prevDesde.getDate()).padStart(2,'0')}/${String(prevDesde.getMonth()+1).padStart(2,'0')}/${prevDesde.getFullYear()}`,
          prev_hasta: `${String(prevHasta.getDate()).padStart(2,'0')}/${String(prevHasta.getMonth()+1).padStart(2,'0')}/${prevHasta.getFullYear()}`,
        },
        totales: {
          snacks_caja: snacksCaja,
          combos_caja: combosCaja,
          snacks_cliente: snacksCliente,
          general: totalGeneral
        },
        participacion: {
          snacks_caja: shareSnacksCaja,     // %
          combos_caja: shareCombosCaja,     // %
          snacks_cliente: shareSnacksCliente// %
        },
        variacion_mom: {
          snacks_caja: momSnacksCaja,       // % o null (mostrar "—")
          combos_caja: momCombosCaja,
          snacks_cliente: momSnacksCliente,
          general: momTotalGeneral
        }
      });
    } finally {
      try { await cn.close(); } catch (e) {}
    }
  } catch (err) {
    console.error('❌ Error getVentasSnacks:', err);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};
