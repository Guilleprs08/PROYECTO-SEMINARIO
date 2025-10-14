const { sanitizeText } = require("../utils/pdfHelper");

const buildCorteCajaDoc = (negocio, corte, denominaciones) => {
  const filasDenominaciones = [
    [
      { text: "Denominación", bold: true },
      { text: "Cantidad", bold: true, alignment: "center" },
      { text: "Subtotal", bold: true, alignment: "right" }
    ]
  ];

  if (denominaciones && denominaciones.length > 0) {
    denominaciones.forEach((d) => {
      filasDenominaciones.push([
        `Q${Number(d.DENOMINACION).toFixed(2)}`,
        { text: `${d.CANTIDAD}`, alignment: "center" },
        { text: `Q${Number(d.SUBTOTAL).toFixed(2)}`, alignment: "right" }
      ]);
    });
  } else {
    filasDenominaciones.push([
      { text: "Sin denominaciones registradas", colSpan: 3, alignment: "center" },
      {},
      {}
    ]);
  }

  // --- Cálculos totales
  const totalContado  = Number(corte.TOTAL_CONTADO || 0);
  const montoEsperado = Number(corte.MONTO_ESPERADO || 0);
  const diferencia    = Number((totalContado - montoEsperado).toFixed(2));

  // Construir filas de totales (sin “CUADRA”)
  const filasTotales = [
    [{ text: "MONTO APERTURA:", bold: true }, { text: `Q${Number(corte.MONTO_APERTURA || 0).toFixed(2)}`, alignment: "right" }],
    [{ text: "TOTAL VENTAS:",   bold: true }, { text: `Q${Number(corte.TOTAL_VENTAS   || 0).toFixed(2)}`, alignment: "right" }],
    [{ text: "MONTO ESPERADO:", bold: true }, { text: `Q${montoEsperado.toFixed(2)}`,                     alignment: "right" }],
    [{ text: "TOTAL CONTADO:",  bold: true }, { text: `Q${totalContado.toFixed(2)}`,                      alignment: "right" }],
  ];

  // Solo mostrar “SOBRANTE/FALTANTE” cuando hay diferencia
  if (diferencia !== 0) {
    const etiqueta = diferencia > 0 ? "SOBRANTE:" : "FALTANTE:";
    filasTotales.push([
      { text: etiqueta, bold: true },
      { text: `Q${Math.abs(diferencia).toFixed(2)}`, alignment: "right" }
    ]);
  }

  return {
    pageSize: { width: 226, height: "auto" },
    pageMargins: [10, 10, 10, 10],
    content: [
      { text: sanitizeText(negocio.NOMBRE_CINE || "CineFlow"), style: "header" },
      { text: sanitizeText(negocio.DIRECCION || ""), style: "subheader" },
      { text: `Tel: ${sanitizeText(negocio.TELEFONO || "")} | ${sanitizeText(negocio.CORREO || "")}`, style: "subheader" },
      { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

      { text: "CORTE / CIERRE DE CAJA", bold: true, alignment: "center", margin: [0, 5] },

      { columns: [{ text: "Caja:",   bold: true, width: 60 }, { text: sanitizeText(corte.CAJA)   }] },
      { columns: [{ text: "Cajero:", bold: true, width: 60 }, { text: sanitizeText(corte.CAJERO) }] },
      { columns: [{ text: "Fecha:",  bold: true, width: 60 }, { text: sanitizeText(corte.FECHA)  }] },
      { columns: [{ text: "Hora:",   bold: true, width: 60 }, { text: sanitizeText(corte.HORA)   }] },
      ...(corte.NUMERO_TICKET ? [
        { columns: [{ text: "Ticket:", bold: true, width: 60 }, { text: sanitizeText(corte.NUMERO_TICKET) }] }
      ] : []),

      { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

      { text: "DENOMINACIONES:", bold: true, margin: [0, 5] },
      { table: { widths: ["*", 40, 60], body: filasDenominaciones }, layout: "noBorders" },

      { canvas: [{ type: "line", x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 1 }] },

      { table: { widths: ["*", "auto"], body: filasTotales }, layout: "noBorders", margin: [0, 5] },

      ...(corte.OBSERVACIONES
        ? [{ text: "Observaciones:", bold: true, margin: [0, 5, 0, 0] },
           { text: sanitizeText(corte.OBSERVACIONES), margin: [0, 0, 0, 5] }]
        : []),

      { text: "\n_______________________", alignment: "center" },
      { text: "Firma Cajero", alignment: "center", margin: [0, 0, 0, 6] },
      { text: "_______________________", alignment: "center" },
      { text: "Firma Supervisor", alignment: "center", margin: [0, 0, 0, 10] },

      { text: "Sistema POS v2.1", style: "footer" },
      { text: "www.comercialguatemala.com", style: "footer" },
      { text: "Conserve este comprobante", style: "footer" }
    ],
    styles: {
      header: { fontSize: 12, bold: true, alignment: "center" },
      subheader: { fontSize: 8, alignment: "center" },
      footer: { fontSize: 8, alignment: "center" }
    },
    defaultStyle: { font: "Roboto", fontSize: 8 }
  };
};

module.exports = { buildCorteCajaDoc };
