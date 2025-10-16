const db = require("../../config/db");
const oracledb = require("oracledb");
const { sendPDF } = require("../../../utils/pdfHelper");
const { buildReportesDeSalaDoc } = require("../../../pdf/Reportes_de_Sala.doc");

const z = n => String(n).padStart(2,"0");
const fmtFecha = d => `${z(d.getDate())}/${z(d.getMonth()+1)}/${d.getFullYear()}`;
const fmtHora  = d => `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
const yyyymmdd_hhmmss = d => `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;

exports.generarReporteSalasPDF = async (req, res) => {
  let cn;
  try {
    const { filtros={}, kpis={}, ocupacion=[], tendencia=[], detalle=[] } = req.body || {};
    // Debe venir al menos algo en detalle u ocupación para no exportar vacío
    if (!Array.isArray(detalle) && !Array.isArray(ocupacion)) {
      return res.status(400).json({ message: "No hay datos para exportar." });
    }

    cn = await db.getConnection();
    const rsNeg = await cn.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM POS_CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = rsNeg.rows?.[0] || { NOMBRE_CINE:"Mi Cine", DIRECCION:"", TELEFONO:"", CORREO:"" };

    const now = new Date();
    const payload = {
      nowFecha: fmtFecha(now),
      nowHora:  fmtHora(now),
      filtros: {
        rangoLabel: filtros.rangoLabel || filtros.rango_label,
        fechaIni:   filtros.fechaIni || filtros.fecha_ini,
        fechaFin:   filtros.fechaFin || filtros.fecha_fin,
        salaNombre: filtros.salaNombre || filtros.sala || "ALL"
      },
      kpis,
      ocupacion,
      tendencia,
      detalle
    };

    const doc = buildReportesDeSalaDoc(negocio, payload);
    const fname = `reportes_de_sala_${yyyymmdd_hhmmss(now)}.pdf`;
    sendPDF(res, doc, fname);
  } catch (err) {
    console.error("❌ Error generarReporteSalasPDF:", err);
    res.status(500).json({ message: "Error al generar PDF." });
  } finally {
    try { await cn?.close(); } catch {}
  }
};
