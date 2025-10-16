// controllers/excel/reportesDeSala.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");
const ExcelJS = require("exceljs");

/* ====== Utils ====== */
const z = n => String(n).padStart(2, "0");
const fmtFecha = d => `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtHora  = d => `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
const yyyymmdd_hhmmss = d =>
  `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;

/** Normaliza base64 que venga con prefijo "data:image/png;base64,..." */
function normalizeBase64Image(b64 = "") {
  if (typeof b64 !== "string") return null;
  const idx = b64.indexOf("base64,");
  return idx >= 0 ? b64.slice(idx + 7) : b64;
}

exports.generarReportesDeSalaExcel = async (req, res) => {
  let cn;
  try {
    const {
      filtros = {},
      kpis = {},
      ocupacion = [],
      tendencia = [],
      detalle = [],
      charts = {}
    } = req.body || {};

    if (!Array.isArray(ocupacion) && !Array.isArray(tendencia) && !Array.isArray(detalle)) {
      return res.status(400).json({ message: "No hay datos para exportar." });
    }

    cn = await db.getConnection();

    // Datos del negocio
    const rsNeg = await cn.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM POS_CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = rsNeg.rows?.[0] || {};

    /* ====== Workbook ====== */
    const wb = new ExcelJS.Workbook();

    /* ======================= Hoja: Resumen ======================= */
    const ws = wb.addWorksheet("Resumen", { properties: { defaultRowHeight: 18 } });

    // Columnas (A–I) pensadas para el layout
    ws.columns = [
      { key: "A", width: 22 },
      { key: "B", width: 20 },
      { key: "C", width: 6  },
      { key: "D", width: 16 },
      { key: "E", width: 16 },
      { key: "F", width: 16 },
      { key: "G", width: 16 },
      { key: "H", width: 16 },
      { key: "I", width: 14 },
    ];

    // Encabezado negocio
    ws.mergeCells("A1:I1");
    ws.getCell("A1").value = negocio.NOMBRE_CINE || "CineFlow";
    ws.getCell("A1").font = { bold: true, size: 16 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.mergeCells("A2:I2");
    const linea2 = [
      negocio.DIRECCION || "",
      negocio.TELEFONO ? `Tel: ${negocio.TELEFONO}` : "",
      negocio.CORREO ? `•  ${negocio.CORREO}` : ""
    ].filter(Boolean).join("   •   ");
    ws.getCell("A2").value = linea2;
    ws.getCell("A2").alignment = { horizontal: "center" };

    // Título general
    ws.mergeCells("A4:I4");
    ws.getCell("A4").value = "REPORTE DE OCUPACIÓN DE SALAS";
    ws.getCell("A4").font = { bold: true, size: 14 };
    ws.getCell("A4").alignment = { horizontal: "center" };

    const now = new Date();
    ws.getCell("A5").value = `Fecha generación: ${fmtFecha(now)}`;
    ws.getCell("I5").value = `Hora: ${fmtHora(now)}`;
    ws.getCell("I5").alignment = { horizontal: "right" };

    // Filtro (solo Sala)
    const sala = filtros.salaNombre ?? filtros.sala;
    if (sala && sala !== "ALL") {
      ws.getCell("A6").value = "Sala:";
      ws.getCell("A6").font = { bold: true };
      ws.getCell("B6").value = sala;
    }

    // ===== Resumen General (bloque de 4 líneas) =====
    ws.getCell("A8").value = "Resumen General";
    ws.getCell("A8").font = { bold: true, size: 12 };

    ws.getCell("A9").value  = "Ocupación Promedio:";
    ws.getCell("A9").font   = { bold: true };
    ws.getCell("B9").value  = `${Number(kpis.ocupacionPromedio15d || 0).toFixed(1)}%`;

    ws.getCell("A10").value = "Total Asientos:";
    ws.getCell("A10").font  = { bold: true };
    ws.getCell("B10").value = Number(kpis.totalAsientos || 0);
    ws.getCell("B10").numFmt = '#,##0';

    ws.getCell("A11").value = "Asientos Ocupados:";
    ws.getCell("A11").font  = { bold: true };
    ws.getCell("B11").value = Number(kpis.asientosOcupadosHoy || 0);
    ws.getCell("B11").numFmt = '#,##0';

    ws.getCell("A12").value = "Salas Activas:";
    ws.getCell("A12").font  = { bold: true };
    ws.getCell("B12").value = Number(kpis.salasActivas || 0);

    // ===== Títulos de gráficas (separadas) =====
    ws.mergeCells("A14:E14");
    ws.getCell("A14").value = "Ocupación por Sala";
    ws.getCell("A14").font = { bold: true };

    ws.mergeCells("F14:I14");
    ws.getCell("F14").value = "Tendencia Semanal";
    ws.getCell("F14").font = { bold: true };

    // Imágenes de gráficas en bloques separados
    const imgOcc = normalizeBase64Image(charts.imgOcupacion);
    const imgTrend = normalizeBase64Image(charts.imgTendencia);

    if (imgOcc) {
      const id = wb.addImage({ base64: imgOcc, extension: "png" });
      ws.mergeCells("A15:E31");         // bloque izquierdo
      ws.addImage(id, "A15:E31");
    }
    if (imgTrend) {
      const id = wb.addImage({ base64: imgTrend, extension: "png" });
      ws.mergeCells("F15:I31");         // bloque derecho
      ws.addImage(id, "F15:I31");
    }

    // ===== Detalle (más abajo, con espacio) =====
    ws.getCell("A33").value = "Detalle de Ocupación por Sala y Día";
    ws.getCell("A33").font  = { bold: true };

    // Encabezado tabla
    const detHeader = ws.addRow([
      "Sala", "Día", "Capacidad", "Ocupados", "Disponibles", "% Ocupación", "Estado"
    ]);
    const detHeaderIdx = detHeader.number;
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getRow(detHeaderIdx).getCell(c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    }

    // Filas detalle
    (detalle || []).forEach(r => {
      ws.addRow([
        r.SALA || "",
        String((r.DIA_SEMANA || "").toString().trim()),
        Number(r.CAPACIDAD || 0),
        Number(r.OCUPADOS || 0),
        Number(r.DISPONIBLES || 0),
        Number(r.PCT_OCUPACION || 0) / 100, // Excel %
        r.ESTADO || "",
      ]);
    });

    // Formatos y bordes
    const lastDetRow = ws.lastRow.number;
    for (let i = detHeaderIdx + 1; i <= lastDetRow; i++) {
      ws.getCell(`C${i}`).alignment = { horizontal: "right" };
      ws.getCell(`D${i}`).alignment = { horizontal: "right" };
      ws.getCell(`E${i}`).alignment = { horizontal: "right" };
      ws.getCell(`F${i}`).numFmt = "0.0%";
      ws.getCell(`F${i}`).alignment = { horizontal: "right" };
      for (let col = 1; col <= 7; col++) {
        ws.getRow(i).getCell(col).border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      }
    }
    for (let col = 1; col <= 7; col++) {
      ws.getRow(detHeaderIdx).getCell(col).border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    }

    /* ====== (Opcional) Hojas auxiliares intactas ======
       Si no las quieres, puedes eliminarlas.
    */
    const wsOcc = wb.addWorksheet("Ocupación por Sala", { properties: { defaultRowHeight: 18 } });
    wsOcc.columns = [
      { header: "Sala",        key: "sala",       width: 34 },
      { header: "Capacidad",   key: "capacidad",  width: 16 },
      { header: "Ocupados",    key: "ocupados",   width: 16 },
      { header: "% Ocupación", key: "pct",        width: 18 },
    ];
    const occHeader = wsOcc.addRow(["Sala", "Capacidad", "Ocupados", "% Ocupación"]);
    const occHeaderIdx = occHeader.number;
    occHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    });
    (ocupacion || []).forEach(rw => {
      const cap = Number(rw.CAPACIDAD || 0);
      const occ = Number(rw.OCUPADOS || 0);
      const pct = cap ? (100 * occ / cap) : 0;
      wsOcc.addRow([rw.SALA || "", cap, occ, pct / 100]);
    });
    for (let i = occHeaderIdx + 1; i <= wsOcc.lastRow.number; i++) {
      wsOcc.getCell(`B${i}`).alignment = { horizontal: "right" };
      wsOcc.getCell(`C${i}`).alignment = { horizontal: "right" };
      wsOcc.getCell(`D${i}`).numFmt = "0.0%";
      wsOcc.getCell(`D${i}`).alignment = { horizontal: "right" };
      for (let col = 1; col <= 4; col++) {
        wsOcc.getRow(i).getCell(col).border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      }
    }
    for (let col = 1; col <= 4; col++) {
      wsOcc.getRow(occHeaderIdx).getCell(col).border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    }

    const wsTen = wb.addWorksheet("Tendencia Semanal", { properties: { defaultRowHeight: 18 } });
    wsTen.columns = [
      { header: "Día",          key: "dia", width: 30 },
      { header: "% Ocupación",  key: "pct", width: 18 },
    ];
    const tenHeader = wsTen.addRow(["Día", "% Ocupación"]);
    const tenHeaderIdx = tenHeader.number;
    tenHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    });
    (tendencia || []).forEach(rw => {
      const dia = rw.DIA || rw.dia || null;
      const etiqueta = dia
        ? new Date(dia).toLocaleDateString("es-GT", { weekday: "long", day: "2-digit", month: "2-digit" })
        : String(rw.DIA_SEMANA || "").toString().trim();
      wsTen.addRow([etiqueta, Number(rw.PCT_OCUPACION || rw.pct_ocupacion || 0) / 100]);
    });
    for (let i = tenHeaderIdx + 1; i <= wsTen.lastRow.number; i++) {
      wsTen.getCell(`B${i}`).numFmt = "0.0%";
      wsTen.getCell(`B${i}`).alignment = { horizontal: "right" };
      for (let col = 1; col <= 2; col++) {
        wsTen.getRow(i).getCell(col).border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      }
    }
    for (let col = 1; col <= 2; col++) {
      wsTen.getRow(tenHeaderIdx).getCell(col).border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    }

    const wsDet = wb.addWorksheet("Detalle", { properties: { defaultRowHeight: 18 } });
    wsDet.columns = [
      { header: "Sala",         key: "sala",       width: 26 },
      { header: "Día",          key: "dia",        width: 18 },
      { header: "Capacidad",    key: "cap",        width: 14 },
      { header: "Ocupados",     key: "occ",        width: 14 },
      { header: "Disponibles",  key: "disp",       width: 16 },
      { header: "% Ocupación",  key: "pct",        width: 16 },
      { header: "Estado",       key: "estado",     width: 16 },
    ];
    const detHeader2 = wsDet.addRow(["Sala", "Día", "Capacidad", "Ocupados", "Disponibles", "% Ocupación", "Estado"]);
    const detHeader2Idx = detHeader2.number;
    detHeader2.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    });
    (detalle || []).forEach(rw => {
      wsDet.addRow([
        rw.SALA || "",
        String((rw.DIA_SEMANA || "").toString().trim()),
        Number(rw.CAPACIDAD || 0),
        Number(rw.OCUPADOS || 0),
        Number(rw.DISPONIBLES || 0),
        Number(rw.PCT_OCUPACION || 0) / 100,
        rw.ESTADO || "",
      ]);
    });
    for (let i = detHeader2Idx + 1; i <= wsDet.lastRow.number; i++) {
      wsDet.getCell(`C${i}`).alignment = { horizontal: "right" };
      wsDet.getCell(`D${i}`).alignment = { horizontal: "right" };
      wsDet.getCell(`E${i}`).alignment = { horizontal: "right" };
      wsDet.getCell(`F${i}`).numFmt = "0.0%";
      wsDet.getCell(`F${i}`).alignment = { horizontal: "right" };
      for (let col = 1; col <= 7; col++) {
        wsDet.getRow(i).getCell(col).border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      }
    }
    for (let col = 1; col <= 7; col++) {
      wsDet.getRow(detHeader2Idx).getCell(col).border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    }

    /* ====== Respuesta ====== */
    const fname = `reportes_sala_${yyyymmdd_hhmmss(now)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${fname}`);
    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("❌ Error generarReportesDeSalaExcel:", err);
    return res.status(500).json({ message: "Error al generar Excel." });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
