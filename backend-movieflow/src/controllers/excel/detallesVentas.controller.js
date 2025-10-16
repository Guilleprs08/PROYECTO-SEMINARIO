// controllers/excel/detallesVentas.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");
const ExcelJS = require("exceljs");

/* ===== Utilidades de fecha/hora ===== */
const z = n => String(n).padStart(2, "0");
const fmtFecha = d => `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtHora  = d => `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
const yyyymmdd_hhmmss = d =>
  `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;

exports.generarDetallesVentaExcel = async (req, res) => {
  let cn;
  try {
    const { filtros = {}, rows, total } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No hay filas para exportar." });
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

    // Completar nombre de vendedor si llegó solo el ID
    if (!filtros.vendedorNombre && filtros.vendedorId) {
      const rsVend = await cn.execute(
        `SELECT NOMBRE FROM USUARIOS WHERE ID = :id`,
        { id: Number(filtros.vendedorId) || 0 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (rsVend.rows?.[0]?.NOMBRE) filtros.vendedorNombre = rsVend.rows[0].NOMBRE;
    }

    // Workbook / Worksheet
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Detalles de Venta", { properties: { defaultRowHeight: 18 } });

    ws.columns = [
      { header: "Nombre",             key: "nombre",   width: 34 },
      { header: "Tipo",               key: "tipo",     width: 14 },
      { header: "Cantidad vendida",   key: "cantidad", width: 18 },
      { header: "Precio unit. (Q)",   key: "precio",   width: 18 },
      { header: "Subtotal (Q)",       key: "subtotal", width: 18 },
    ];

    // Encabezado
    ws.mergeCells("A1:E1");
    ws.getCell("A1").value = negocio.NOMBRE_CINE || "CineFlow";
    ws.getCell("A1").font = { bold: true, size: 16 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.mergeCells("A2:E2");
    const linea2 = [
      negocio.DIRECCION || "",
      negocio.TELEFONO ? `Tel: ${negocio.TELEFONO}` : "",
      negocio.CORREO ? `•  ${negocio.CORREO}` : ""
    ].filter(Boolean).join("   •   ");
    ws.getCell("A2").value = linea2;
    ws.getCell("A2").alignment = { horizontal: "center" };

    ws.mergeCells("A4:E4");
    ws.getCell("A4").value = "DETALLES DE VENTA";
    ws.getCell("A4").font = { bold: true, size: 14 };
    ws.getCell("A4").alignment = { horizontal: "center" };

    const now = new Date();
    ws.getCell("A5").value = `Fecha generación: ${fmtFecha(now)}`;
    ws.getCell("E5").value = `Hora: ${fmtHora(now)}`;
    ws.getCell("E5").alignment = { horizontal: "right" };

    // Filtros
    const filtrosData = [
      ["Rango:",         filtros.rangoTexto || filtros.rango || "Todos"],
      ["Caja:",          filtros.cajaNombre || filtros.caja || "Todas"],
      ["Tipo de Venta:", filtros.tipoVentaNombre || filtros.tipoVenta || "Todos"],
      ["Rol:",           filtros.rolNombre || filtros.rol || "Todos"],
      ["Vendedor:",      filtros.vendedorNombre || "Todos"],
    ];
    let fila = 7;
    for (const [label, value] of filtrosData) {
      ws.getCell(`A${fila}`).value = label;
      ws.getCell(`A${fila}`).font = { bold: true };
      ws.getCell(`B${fila}`).value = value;
      fila++;
    }

    // Cabecera de tabla (¡estilo solo A–E!)
    ws.addRow([]); // línea en blanco
    const header = ws.addRow(["Nombre", "Tipo", "Cantidad vendida", "Precio unit. (Q)", "Subtotal (Q)"]);
    const headerRowIdx = header.number;

    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    });
    // (No usar header.fill = … para evitar que pinte toda la fila)

    const startDataRow = header.number + 1;

    // Datos
    rows.forEach(r => {
      ws.addRow([
        r.NOMBRE,
        r.TIPO,
        Number(r.CANTIDAD_VENDIDA) || 0,
        Number(r.PRECIO_UNITARIO) || 0,
        Number(r.SUBTOTAL) || 0,
      ]);
    });

    // Formatos numéricos / alineación
    const lastDataRow = ws.lastRow.number;
    for (let i = startDataRow; i <= lastDataRow; i++) {
      ws.getCell(`C${i}`).alignment = { horizontal: "center" };
      ws.getCell(`D${i}`).alignment = { horizontal: "right" };
      ws.getCell(`E${i}`).alignment = { horizontal: "right" };
      ws.getCell(`D${i}`).numFmt = '"Q"#,##0.00';
      ws.getCell(`E${i}`).numFmt = '"Q"#,##0.00';
    }

    // Total
    const totalCalculado = rows.reduce((acc, r) => acc + (Number(r.SUBTOTAL) || 0), 0);
    const totalFinal = Number.isFinite(Number(total)) ? Number(total) : totalCalculado;

    const totalRow = ws.addRow(["", "", "", "Total general", totalFinal]);
    totalRow.font = { bold: true };
    totalRow.getCell(4).alignment = { horizontal: "right" };
    totalRow.getCell(5).numFmt = '"Q"#,##0.00';
    const totalRowIdx = totalRow.number;

    // Bordes (solo A–E)
    const applyBorders = ({ top, left, bottom, right }) => {
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          ws.getRow(r).getCell(c).border = {
            top:    { style: "thin" },
            left:   { style: "thin" },
            bottom: { style: "thin" },
            right:  { style: "thin" },
          };
        }
      }
    };
    applyBorders({ top: headerRowIdx, left: 1, bottom: totalRowIdx, right: 5 });

    // Congelar hasta cabecera
    ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

    // Respuesta
    const fname = `detalles_venta_${yyyymmdd_hhmmss(now)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${fname}`);
    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("❌ Error generarDetallesVentaExcel:", err);
    return res.status(500).json({ message: "Error al generar Excel." });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
