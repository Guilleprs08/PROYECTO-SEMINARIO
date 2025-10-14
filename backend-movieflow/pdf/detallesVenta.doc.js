const { sanitizeText } = require("../utils/pdfHelper");
const fmtQ = n => `Q${Number(n || 0).toFixed(2)}`;

// Par etiqueta:valor alineado como antes
function labelVal(label, val) {
  return {
    columns: [
      { text: `${label}:`, bold: true, width: 120 },
      { text: sanitizeText(val || "-") }
    ],
    margin: [0, 1, 0, 1]
  };
}

// ⬅️ SIN encabezado “Filtros aplicados”
function filtrosBlock(f) {
  const out = [];
  if (f?.rangoLabel) out.push(labelVal("Rango", f.rangoLabel));
  if (f?.rango === "personalizado" && (f.desde || f.hasta)) {
    out.push(labelVal("Fecha Desde", f.desde || ""));
    out.push(labelVal("Fecha Hasta", f.hasta || ""));
  }
  if (f?.cajaNombre) out.push(labelVal("Caja", f.cajaNombre));
  if (f?.tipoLabel) out.push(labelVal("Tipo de Venta", f.tipoLabel));
  if (f?.rolNombre) out.push(labelVal("Rol", f.rolNombre));
  if (f?.vendedorNombre) out.push(labelVal("Vendedor", f.vendedorNombre));
  return out;
}

function buildTable(rows, mostrarTipo) {
  const headers = [
    { text: "Nombre", bold: true },
    ...(mostrarTipo ? [{ text: "Tipo", bold: true, alignment: "center" }] : []),
    { text: "Cantidad vendida", bold: true, alignment: "right" },
    { text: "Precio unit. (Q)", bold: true, alignment: "right" },
    { text: "Subtotal (Q)", bold: true, alignment: "right" }
  ];

  const body = [headers];

  (rows || []).forEach(r => {
    body.push([
      sanitizeText(r.nombre),
      ...(mostrarTipo
        ? [{ text: sanitizeText(r.tipo || r.origen || ((r.es_combo||r.esCombo) ? "Combo":"Producto")), alignment: "center" }]
        : []),
      { text: Number(r.cantidad || 0).toLocaleString(), alignment: "right" },
      { text: fmtQ(r.precio), alignment: "right" },
      { text: fmtQ(r.subtotal), alignment: "right" },
    ]);
  });

  return {
    table: {
      headerRows: 1,
      // mismas proporciones; no tocamos layout
      widths: mostrarTipo ? ["*", 70, 90, 90, 100] : ["*", 110, 110, 110],
      body
    },
    layout: "lightHorizontalLines",
    margin: [0, 6, 0, 0]
  };
}

const buildDetallesVentaDoc = (negocio = {}, payload = {}) => {
  const {
    nowFecha = "",
    nowHora  = "",     // viene del controller en 24h
    filtros  = {},
    rows     = [],
    total    = 0
  } = payload;

  // ⬅️ SOLO mostramos “Tipo” si el filtro efectivo es TODOS
  const mostrarTipo = String(filtros?.tipo || "").toLowerCase() === "todos";

  return {
    pageSize: "LETTER",
    pageMargins: [32, 36, 32, 40],
    defaultStyle: { font: "Roboto", fontSize: 9 },
    styles: {
      headTitle: { fontSize: 14, bold: true, alignment: "center", margin: [0, 2, 0, 2] },
      business:  { fontSize: 10, alignment: "center" },
      small:     { fontSize: 8, color: "#666" },
      totalRow:  { bold: true }
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Página ${currentPage} de ${pageCount}`, style: "small" },
        { text: "Sistema POS v2.1", alignment: "right", style: "small" }
      ],
      margin: [32, 10, 32, 0]
    }),
    content: [
      // Cabecera negocio (igual)
      { text: sanitizeText(negocio.NOMBRE_CINE || "Comercial Guatemala"), style: "headTitle" },
      { text: sanitizeText(negocio.DIRECCION || ""), style: "business" },
      { text: `Tel: ${sanitizeText(negocio.TELEFONO || "")}  •  ${sanitizeText(negocio.CORREO || "")}`, style: "business", margin: [0, 0, 0, 6] },

      // Título + fecha/hora (misma posición)
      { text: "DETALLES DE VENTA", style: "headTitle", margin: [0, 2, 0, 6] },
      {
        columns: [
          { text: `Fecha generación: ${nowFecha}`, style: "small" },
          { text: `Hora: ${nowHora}`, alignment: "right", style: "small" }
        ],
        margin: [0, 0, 0, 6]
      },

      // Filtros en el mismo bloque (sin encabezado extra)
      ...filtrosBlock(filtros),

      // Tabla
      buildTable(rows, mostrarTipo),

      // Total general
      {
        table: {
          widths: ["*", 120],
          body: [[
            { text: "Total general", style: "totalRow", alignment: "right" },
            { text: fmtQ(total), style: "totalRow", alignment: "right" }
          ]]
        },
        layout: "noBorders",
        margin: [0, 8, 0, 0]
      }
    ]
  };
};

module.exports = { buildDetallesVentaDoc };
