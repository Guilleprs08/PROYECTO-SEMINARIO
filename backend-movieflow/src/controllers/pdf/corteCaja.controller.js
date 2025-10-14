// backend-movieflow/src/controllers/pdf/corteCaja.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

// util para enviar el PDF
const { sendPDF } = require("../../../utils/pdfHelper");
// constructor del documento
const { buildCorteCajaDoc } = require("../../../pdf/corteCaja.doc");

const generarCorteCajaPDF = async (req, res) => {
  let connection;
  try {
    const { id_cierre } = req.params;
    if (!id_cierre) {
      return res.status(400).json({ message: "ID de cierre requerido" });
    }

    connection = await db.getConnection();

    // ====== 1) Datos del negocio (encabezado) ======
    const qNeg = await connection.execute(
      `
      SELECT
        NOMBRE_CINE AS NOMBRE_CINE,
        NVL(DIRECCION,'') AS DIRECCION,
        NVL(TELEFONO,'') AS TELEFONO,
        NVL(CORREO,'')   AS CORREO
      FROM POS_CONFIGURACION_NEGOCIO
      WHERE ROWNUM = 1
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = qNeg.rows?.[0] || {
      NOMBRE_CINE: "CineFlow",
      DIRECCION: "",
      TELEFONO: "",
      CORREO: "",
    };

    // ====== 2) Cabecera del corte (corte/cierre) ======
    // Nota: CAJA_ID vive en POS_APERTURA_CAJA, NO en POS_CIERRE_CAJA
    const qCorte = await connection.execute(
      `
      SELECT
        cc.ID_CIERRE,
        cc.NUMERO_TICKET,
        TO_CHAR(cc.FECHA_CIERRE,'DD/MM/YYYY')   AS FECHA,
        TO_CHAR(cc.HORA_CIERRE,'HH24:MI')       AS HORA,
        u.NOMBRE                                 AS CAJERO,
        caj.NOMBRE_CAJA                          AS CAJA,

        /* nombres que espera el builder */
        NVL(cc.MONTO_CONTADO,  0)               AS TOTAL_CONTADO,
        NVL(cc.MONTO_ESPERADO, 0)               AS MONTO_ESPERADO,
        NVL(cc.MONTO_APERTURA, 0)               AS MONTO_APERTURA,
        NVL(cc.MONTO_VENTAS,   0)               AS TOTAL_VENTAS,
        NVL(cc.DIFERENCIA, NVL(cc.MONTO_CONTADO,0) - NVL(cc.MONTO_ESPERADO,0)) AS DIFERENCIA,

        NVL(cc.OBSERVACIONES,'') AS OBSERVACIONES
      FROM POS_CIERRE_CAJA cc
      JOIN POS_APERTURA_CAJA ap ON ap.ID_APERTURA = cc.APERTURA_ID
      LEFT JOIN POS_CAJAS  caj   ON caj.ID_CAJA   = ap.CAJA_ID
      LEFT JOIN USUARIOS   u     ON u.ID          = cc.USUARIO_ID
      WHERE cc.ID_CIERRE = :id
      `,
      { id: id_cierre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const corte = qCorte.rows?.[0];
    if (!corte) {
      return res.status(404).json({ message: "Cierre no encontrado" });
    }

    // ====== 3) Denominaciones (detalle) ======
    // Tu tabla tiene DENOMINACION_ID y POS_DENOMINACIONES.VALOR.
    // El builder espera DENOMINACION (monto), CANTIDAD, SUBTOTAL.
    const qDen = await connection.execute(
      `
      SELECT
        den.VALOR      AS DENOMINACION,
        d.CANTIDAD     AS CANTIDAD,
        (den.VALOR * d.CANTIDAD) AS SUBTOTAL
      FROM POS_CIERRE_DENOMINACION d
      JOIN POS_DENOMINACIONES den
        ON den.ID_DENOMINACION = d.DENOMINACION_ID
      WHERE d.CIERRE_ID = :id
      ORDER BY den.VALOR DESC
      `,
      { id: id_cierre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const denominaciones = qDen.rows || [];

    // ====== 4) Construir PDF ======
    const docDefinition = buildCorteCajaDoc(negocio, corte, denominaciones);
    sendPDF(res, docDefinition, `corte_caja_${id_cierre}.pdf`);
  } catch (err) {
    console.error("❌ Error en generarCorteCajaPDF:", err);
    res.status(500).json({ message: "Error generando PDF de corte de caja" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

module.exports = { generarCorteCajaPDF };
