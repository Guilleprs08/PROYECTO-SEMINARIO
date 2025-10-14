// src/controllers/reportes/ticketPdf.controller.js
const PdfPrinter = require("pdfmake");
const path = require("path");
const db = require("../../config/db");
const oracledb = require("oracledb");

// 🔹 Fuentes Roboto desde /fonts (en la raíz del proyecto)
const fonts = {
  Roboto: {
    normal: path.join(__dirname, "../../../fonts/Roboto-Regular.ttf"),
    bold: path.join(__dirname, "../../../fonts/Roboto-Medium.ttf"),
    italics: path.join(__dirname, "../../../fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(__dirname, "../../../fonts/Roboto-MediumItalic.ttf"),
  },
};

const printer = new PdfPrinter(fonts);

// 🔒 Sanitizar texto
const sanitizeText = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const generarTicketPDF = async (req, res) => {
  let connection;
  try {
    let { id_venta } = req.params;

    // ✅ Validación estricta de id
    id_venta = parseInt(id_venta, 10);
    if (isNaN(id_venta) || id_venta <= 0) {
      return res.status(400).json({ message: "ID de venta inválido" });
    }

    connection = await db.getConnection();

    // 🔹 Datos del negocio (tabla con prefijo POS_)
    const negocioResult = await connection.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM POS_CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = negocioResult.rows[0] || {};

    // 🔹 Cabecera de la venta (POS_VENTAS + USUARIOS)
    const ventaResult = await connection.execute(
      `SELECT v.CODIGO_TICKET,
              TO_CHAR(v.FECHA_CREACION, 'DD/MM/YYYY HH24:MI') AS FECHA,
              v.TOTAL, v.DINERO_RECIBIDO, v.CAMBIO,
              u.NOMBRE AS CAJERO
         FROM POS_VENTAS v
         JOIN USUARIOS u ON v.USUARIO_ID = u.ID
        WHERE v.ID_VENTA = :id`,
      { id: id_venta },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const venta = ventaResult.rows[0];
    if (!venta) return res.status(404).json({ message: "Venta no encontrada" });

    // 🔹 Detalles (PRODUCTOS + COMBOS) con tablas POS_
    const detallesResult = await connection.execute(
      `
      SELECT DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL_LINEA
        FROM (
          -- Productos por unidad
          SELECT p.NOMBRE AS DESCRIPCION,
                 d.CANTIDAD,
                 d.PRECIO_UNITARIO,
                 d.SUBTOTAL_LINEA
            FROM POS_DETALLE_VENTA d
            JOIN POS_PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
           WHERE d.ID_VENTA = :id

          UNION ALL

          -- Combos vendidos
          SELECT cb.NOMBRE AS DESCRIPCION,
                 vc.CANTIDAD,
                 vc.PRECIO_UNITARIO,
                 vc.SUBTOTAL_LINEA
            FROM POS_VENTA_COMBO vc
            JOIN POS_COMBO cb ON cb.ID = vc.COMBO_ID
           WHERE vc.ID_VENTA = :id
        )
      ORDER BY DESCRIPCION
      `,
      { id: id_venta },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const detalles = detallesResult.rows || [];

    // 🔹 Tabla de líneas
    const filasProductos = [
      [
        { text: "Descripción", bold: true },
        { text: "Cantidad", bold: true, alignment: "center" },
        { text: "Precio", bold: true, alignment: "right" },
        { text: "Subtotal", bold: true, alignment: "right" },
      ],
    ];
    detalles.forEach((d) => {
      filasProductos.push([
        sanitizeText(d.DESCRIPCION),
        { text: String(d.CANTIDAD), alignment: "center" },
        { text: `Q${Number(d.PRECIO_UNITARIO).toFixed(2)}`, alignment: "right" },
        { text: `Q${Number(d.SUBTOTAL_LINEA).toFixed(2)}`, alignment: "right" },
      ]);
    });

    // 🔹 Definición del PDF
    const docDefinition = {
      pageSize: { width: 226, height: "auto" }, // ~80mm
      pageMargins: [10, 10, 10, 10],
      content: [
        // Encabezado
        { text: sanitizeText(negocio.NOMBRE_CINE) || "CineFlow", style: "header" },
        { text: sanitizeText(negocio.DIRECCION) || "", style: "subheader" },
        {
          text: `Tel: ${sanitizeText(negocio.TELEFONO) || ""} | ${sanitizeText(negocio.CORREO) || ""}`,
          style: "subheader",
        },
        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

        // Info venta
        { columns: [{ text: "Ticket #:", bold: true, width: 70 }, { text: sanitizeText(venta.CODIGO_TICKET) }] },
        { columns: [{ text: "Fecha:", bold: true, width: 70 }, { text: sanitizeText(venta.FECHA) }] },
        { columns: [{ text: "Cajero:", bold: true, width: 70 }, { text: sanitizeText(venta.CAJERO) }] },

        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

        // Productos/Combos
        { text: "PRODUCTOS:", bold: true, margin: [0, 5] },
        {
          table: { widths: ["*", 40, 50, 50], body: filasProductos },
          layout: "noBorders",
        },

        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

        // Totales
        {
          table: {
            widths: ["*", "auto"],
            body: [
              [{ text: "TOTAL:", bold: true }, { text: `Q${Number(venta.TOTAL).toFixed(2)}`, bold: true, alignment: "right" }],
              ["Recibido:", { text: `Q${Number(venta.DINERO_RECIBIDO).toFixed(2)}`, alignment: "right" }],
              ["Cambio:", { text: `Q${Number(venta.CAMBIO).toFixed(2)}`, alignment: "right" }],
            ],
          },
          layout: "noBorders",
          margin: [0, 5],
        },

        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

        // Footer
        { text: "¡Gracias por su visita!", style: "footer" },
        { text: "Conserve su ticket", style: "footer" },
      ],
      styles: {
        header: { fontSize: 12, bold: true, alignment: "center" },
        subheader: { fontSize: 8, alignment: "center" },
        footer: { fontSize: 8, alignment: "center" },
      },
      defaultStyle: { font: "Roboto", fontSize: 8 },
    };

    // 🔹 Enviar PDF al navegador
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ticket_${sanitizeText(venta.CODIGO_TICKET)}.pdf"`
    );
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error("❌ Error generando ticket PDF:", error);
    res.status(500).json({ message: "Error generando ticket PDF" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

module.exports = { generarTicketPDF };
