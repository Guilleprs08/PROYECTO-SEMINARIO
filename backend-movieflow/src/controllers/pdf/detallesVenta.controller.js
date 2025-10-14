// backend-movieflow/src/controllers/pdf/detallesVenta.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

// ✅ utils está en /utils (sube 3 niveles desde /src/controllers/pdf)
const { sendPDF, sanitizeText } = require("../../../utils/pdfHelper");

// ✅ los .doc están en /pdf (carpeta hermana de /src)
const { buildDetallesVentaDoc } = require("../../../pdf/detallesVenta.doc");

// ===== utilidades de fecha/hora =====
const z = (n) => String(n).padStart(2, "0");
const fmtFecha = (d) => `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtHora  = (d) => `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; // 24h
const yyyymmdd_hhmmss = (d) => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;

exports.generarDetallesVentaPDF = async (req, res) => {
  let cn;
  try {
    const { filtros = {}, rows, total } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No hay filas para exportar." });
    }

    // normalizar filtros mínimos
    const F = {
      rango: String(filtros.rango || "").toLowerCase(),
      rangoLabel: filtros.rangoLabel || filtros.rango_label || "",
      desde: filtros.desde || null,
      hasta: filtros.hasta || null,
      cajaId: filtros.cajaId ?? filtros.caja_id ?? null,
      cajaNombre: filtros.cajaNombre || filtros.caja_nombre || "",
      tipo: String(filtros.tipo || "").toLowerCase(), // "productos" | "combos" | "todos"
      tipoLabel: filtros.tipoLabel || filtros.tipo_label || "",
      roleId: filtros.roleId ?? filtros.role_id ?? null,
      rolNombre: filtros.rolNombre || filtros.rol_nombre || "",
      vendedorId: filtros.vendedorId ?? filtros.vendedor_id ?? null,
      vendedorNombre: filtros.vendedorNombre || filtros.vendNombre || filtros.vendedor_nombre || "",
      generadoEn: filtros.generadoEn || new Date().toISOString(),
    };

    cn = await db.getConnection();

    // datos negocio
    const rsNeg = await cn.execute(
      `SELECT NOMBRE_CINE, DIRECCION, TELEFONO, CORREO
         FROM POS_CONFIGURACION_NEGOCIO
        WHERE ROWNUM = 1`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const negocio = rsNeg.rows?.[0] || {
      NOMBRE_CINE: "Mi Cine",
      DIRECCION: "",
      TELEFONO: "",
      CORREO: ""
    };

    // si falta vendedorNombre pero tenemos ID, completar
    if (!F.vendedorNombre && F.vendedorId) {
      const rsVend = await cn.execute(
        `SELECT NOMBRE FROM USUARIOS WHERE ID = :id`,
        { id: Number(F.vendedorId) || 0 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (rsVend.rows?.[0]?.NOMBRE) F.vendedorNombre = rsVend.rows[0].NOMBRE;
    }

    // sanitizar filas para el doc (asegurar tipos)
    const safeRows = rows.map((r) => ({
      nombre: r.nombre != null ? String(r.nombre) : "",
      cantidad: Number(r.cantidad || 0),
      precio: Number(r.precio || 0),
      subtotal: Number(r.subtotal || 0),
      // campos opcionales
      tipo: r.tipo,
      origen: r.origen,
      es_combo: r.es_combo ?? r.esCombo,
    }));

    const now = new Date();
    const payload = {
      nowFecha: fmtFecha(now),
      nowHora:  fmtHora(now), // 24h
      filtros: F,
      rows: safeRows,
      total: Number(total || 0),
    };

    const doc = buildDetallesVentaDoc(negocio, payload);
    const fname = `detalles_venta_${yyyymmdd_hhmmss(now)}.pdf`;
    sendPDF(res, doc, fname);
  } catch (err) {
    console.error("❌ Error generarDetallesVentaPDF:", err);
    return res.status(500).json({ message: "Error al generar PDF." });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};
