// backend-movieflow/src/controllers/pdf/inicioaperturaCaja.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

// ✅ utils está en /utils (sube 3 niveles desde /src/controllers/pdf)
const { sendPDF, sanitizeText } = require("../../../utils/pdfHelper");

// ✅ los .doc están en /pdf (carpeta hermana de /src)
const { buildAperturaCajaDoc } = require("../../../pdf/inicioaperturaCaja.doc");

// Generar PDF de apertura de caja
const generarAperturaCajaPDF = async (req, res) => {
  let connection;
  try {
    let { id_apertura } = req.params;

    // Validación
    id_apertura = parseInt(id_apertura, 10);
    if (!Number.isFinite(id_apertura) || id_apertura <= 0) {
      return res.status(400).json({ message: "ID de apertura inválido" });
    }

    connection = await db.getConnection();

    // 1) Negocio
    const negocioResult = await connection.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM POS_CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = negocioResult.rows?.[0] || {};

    // 2) Cabecera de la apertura (alias en mayúsculas para mapear al doc)
    const aperturaResult = await connection.execute(
      `SELECT 
          A.NUMERO_TICKET                           AS NUMERO_TICKET,
          TO_CHAR(A.FECHA_APERTURA,'DD/MM/YYYY')    AS FECHA,
          TO_CHAR(A.HORA_APERTURA,'HH24:MI')        AS HORA,
          U.NOMBRE                                  AS CAJERO,
          C.NOMBRE_CAJA                             AS CAJA,
          T.NOMBRE_TURNO                            AS TURNO,
          A.TOTAL_EFECTIVO_INICIAL                  AS TOTAL_EFECTIVO_INICIAL,
          A.OBSERVACIONES                           AS OBSERVACIONES
        FROM POS_APERTURA_CAJA A
        JOIN USUARIOS U ON A.USUARIO_ID = U.ID
        JOIN POS_CAJAS C    ON A.CAJA_ID = C.ID_CAJA
        JOIN POS_TURNOS T   ON A.TURNO_ID = T.ID_TURNO
       WHERE A.ID_APERTURA = :ID`,
      { ID: id_apertura },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const apertura = aperturaResult.rows?.[0];
    if (!apertura) {
      return res.status(404).json({ message: "Apertura de caja no encontrada" });
    }

    // 3) Denominaciones (alias en mayúsculas)
    const denomResult = await connection.execute(
      `SELECT 
          D.VALOR      AS DENOMINACION,
          AD.CANTIDAD  AS CANTIDAD,
          AD.SUBTOTAL  AS SUBTOTAL
         FROM POS_APERTURA_DENOMINACION AD
         JOIN POS_DENOMINACIONES D ON AD.DENOMINACION_ID = D.ID_DENOMINACION
        WHERE AD.APERTURA_ID = :ID
        ORDER BY D.VALOR DESC`,
      { ID: id_apertura },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const denominaciones = denomResult.rows || [];

    // Normalizar numéricos por si vinieran null
    apertura.TOTAL_EFECTIVO_INICIAL = Number(apertura.TOTAL_EFECTIVO_INICIAL || 0);
    denominaciones.forEach((d) => {
      d.DENOMINACION = Number(d.DENOMINACION || 0);
      d.CANTIDAD = Number(d.CANTIDAD || 0);
      d.SUBTOTAL = Number(d.SUBTOTAL || 0);
    });

    // 4) Documento
    const docDefinition = buildAperturaCajaDoc(negocio, apertura, denominaciones);

    // 5) Responder PDF
    const ticket = apertura.NUMERO_TICKET ? `_ticket_${apertura.NUMERO_TICKET}` : "";
    sendPDF(res, docDefinition, `apertura_caja${ticket}.pdf`);
  } catch (error) {
    console.error("❌ Error generando PDF de apertura de caja:", error);
    res.status(500).json({ message: "Error generando PDF" });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};

module.exports = { generarAperturaCajaPDF };
