// frontend/src/utils/combos.js

// ===== Util: número seguro =====
const toNumber = (v, def = 0) => {
  const n = Number(String(v ?? '').toString().replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : def;
};

// ===== Util: obtener precio unitario flexible =====
// Soporta distintos nombres de propiedad típicos que pueden venir de tu backend
const getUnitPrice = (item) => {
  if (!item || typeof item !== 'object') return 0;
  const candidates = [
    item.precio,
    item.precioUnitario,
    item.price,
    item.PRECIO,
    item.PRECIO_UNITARIO,
    item.unitPrice,
  ];
  for (const c of candidates) {
    const n = toNumber(c, NaN);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

// ===== Util: obtener cantidad segura =====
const getQty = (item) => {
  if (!item || typeof item !== 'object') return 0;
  // acepta "cantidad", "qty", "CANTIDAD", etc.
  const candidates = [item.cantidad, item.qty, item.QTY, item.CANTIDAD];
  for (const c of candidates) {
    const n = toNumber(c, NaN);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1; // por defecto 1
};

// ===== Formato moneda GTQ =====
let _fmtGTQ;
try {
  _fmtGTQ = new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
} catch {
  _fmtGTQ = null;
}

export const formatMoney = (n = 0) => {
  const v = toNumber(n, 0);
  return _fmtGTQ ? _fmtGTQ.format(v) : `Q${v.toFixed(2)}`;
};

// ===== Resumen financiero de combo =====
// items: [{ precio|precioUnitario|price, cantidad|qty }, ...]
// precioCombo: precio final del combo (GTQ)
export const calcSummary = (items = [], precioCombo = 0) => {
  const combo = toNumber(precioCombo, 0);

  const sumaItems = (Array.isArray(items) ? items : []).reduce((acc, it) => {
    const p = getUnitPrice(it);
    const q = getQty(it);
    return acc + p * q;
  }, 0);

  // ahorro > 0 => el combo es más barato que comprar por separado
  const ahorro = sumaItems - combo;

  // redondeo a 2 decimales para evitar flotantes raros
  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  return {
    suma: round2(sumaItems),
    ahorro: round2(ahorro),
    // Útiles para UI:
    sumaFmt: formatMoney(sumaItems),
    ahorroFmt: formatMoney(ahorro),
    comboFmt: formatMoney(combo),
  };
};

// ===== Extra: total de items “a la carta” (por separado), por si lo necesitas =====
export const sumItems = (items = []) => {
  const total = (Array.isArray(items) ? items : []).reduce((acc, it) => {
    return acc + getUnitPrice(it) * getQty(it);
  }, 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
};
