// backend-movieflow/utils/pdfHelper.js
const PdfPrinter = require("pdfmake");
const path = require("path");

// 🔹 Fuentes Roboto desde carpeta /fonts (hermana de /utils)
const fonts = {
  Roboto: {
    normal:      path.join(__dirname, "../fonts/Roboto-Regular.ttf"),
    bold:        path.join(__dirname, "../fonts/Roboto-Medium.ttf"),
    italics:     path.join(__dirname, "../fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(__dirname, "../fonts/Roboto-MediumItalic.ttf"),
  },
};

const printer = new PdfPrinter(fonts);

// 🔒 Sanitizar texto contra XSS (para nombres, observaciones, etc.)
const sanitizeText = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/"/g, "")
    .replace(/'/g, "");
};

// Para fechas y números → sin escape especial
const sanitizePlain = (str) => (str == null ? "" : String(str));

// 🔹 Enviar PDF al navegador a partir de un docDefinition de pdfmake
const sendPDF = (res, docDefinition, filename = "documento.pdf") => {
  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error("❌ Error en sendPDF:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error al generar PDF" });
    }
  }
};

module.exports = { printer, sanitizeText, sanitizePlain, sendPDF };
