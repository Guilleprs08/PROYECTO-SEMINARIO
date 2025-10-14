const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Cache simple en memoria para no golpear al Banguat en cada request
// Se invalida cada 60 minutos (ajústalo si quieres).
let CACHE = { data: null, ts: 0 };
const CACHE_MS = 60 * 60 * 1000;

const SOAP_URL = 'https://banguat.gob.gt/variables/ws/TipoCambio.asmx';
const SOAP_ACTION = 'http://www.banguat.gob.gt/variables/ws/TipoCambioDia';
const SOAP_BODY = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/"/>
  </soap:Body>
</soap:Envelope>`;

async function fetchTipoCambio() {
  const { data } = await axios.post(SOAP_URL, SOAP_BODY, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': SOAP_ACTION,
    },
    timeout: 15000,
  });

  const parsed = await parseStringPromise(data, { explicitArray: false });

  const result =
    parsed['soap:Envelope']['soap:Body']
      ['TipoCambioDiaResponse']['TipoCambioDiaResult'];

  // CambioDolar → referencia del día (USD→GTQ)
  const varDolar = result?.CambioDolar?.VarDolar;
  const firstDolar = Array.isArray(varDolar) ? varDolar[0] : varDolar;
  const referencia = firstDolar?.referencia ? Number(firstDolar.referencia) : null;
  const fechaRef = firstDolar?.fecha || null;

  // CambioDia → compra/venta (si vienen)
  const varDia = result?.CambioDia?.Var;
  const firstDia = Array.isArray(varDia) ? varDia[0] : varDia;
  const compra = firstDia?.compra ? Number(firstDia.compra) : null;
  const venta = firstDia?.venta ? Number(firstDia.venta) : null;
  const fechaDia = firstDia?.fecha || null;

  return {
    referencia,
    compra,
    venta,
    fecha: fechaRef || fechaDia || null,
    fuente: 'Banguat',
  };
}

exports.getHoy = async (_req, res) => {
  try {
    const now = Date.now();
    if (CACHE.data && (now - CACHE.ts) < CACHE_MS) {
      return res.json({ cached: true, ...CACHE.data });
    }

    const datos = await fetchTipoCambio();
    CACHE = { data: datos, ts: now };
    res.json({ cached: false, ...datos });
  } catch (err) {
    console.error('❌ [tipo-cambio] Error:', err?.message || err);
    // Nunca rompemos el front: devolvemos 503 con shape estable
    return res.status(503).json({
      referencia: null,
      compra: null,
      venta: null,
      fecha: null,
      fuente: 'Banguat',
      error: 'No se pudo obtener el tipo de cambio',
    });
  }
};
