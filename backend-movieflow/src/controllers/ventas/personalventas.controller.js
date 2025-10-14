// controllers/ventas/personalventas.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

// Límite duro por llamada a Oracle (ms)
const CALL_TIMEOUT_MS = 12000;

// Helper: opciones por defecto para cada execute
const opts = (extra = {}) => ({
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  callTimeout: CALL_TIMEOUT_MS,
  ...extra,
});

/* =========================
 * LISTAR PRODUCTOS (VENTAS)
 * ========================= */
exports.listarProductos = async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        p.ID,
        p.NOMBRE,
        p.PRECIO_VENTA,
        p.IMAGEN_URL,
        p.ESTADO_ID,
        u.NOMBRE AS UNIDAD_MEDIDA,
        c.NOMBRE AS CATEGORIA_NOMBRE,
        NVL(agg.STOCK_TOTAL, 0)             AS STOCK_TOTAL,
        TO_CHAR(agg.PROX_VENC,'DD/MM/YYYY') AS PROX_VENC,
        (
          SELECT pe.ESTADO
            FROM POS_PRODUCTO_ESTADO pe
           WHERE pe.PRODUCTO_ID = p.ID
           ORDER BY pe.FECHA_REGISTRO DESC
           FETCH FIRST 1 ROWS ONLY
        ) AS ESTADO_DIN
      FROM POS_PRODUCTO_NUEVO p
      JOIN POS_UNIDAD_MEDIDA u     ON u.ID = p.UNIDAD_MEDIDA_ID
      JOIN POS_CATEGORIAPRODUCTO c ON c.ID = p.CATEGORIA_ID
      LEFT JOIN (
        SELECT PRODUCTO_ID,
               NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
               MIN(FECHA_VENCIMIENTO)          AS PROX_VENC
          FROM POS_PRODUCTO_POR_LOTE
         GROUP BY PRODUCTO_ID
      ) agg ON agg.PRODUCTO_ID = p.ID
      WHERE p.ESTADO_ID = :estado_activo
      ORDER BY p.NOMBRE
    `;

    const result = await connection.execute(query, { estado_activo: 1 }, opts());

    const productos = result.rows.map((row) => {
      let alerta = null;
      const estado = String(row.ESTADO_DIN || "").toUpperCase();
      switch (estado) {
        case "VENCIDO":     alerta = "Producto vencido - no disponible"; break;
        case "POR_VENCER":  alerta = "Producto por vencer - revisar";    break;
        case "BLOQUEADO":   alerta = "Producto no disponible";           break;
        case "STOCK_BAJO":  alerta = "Stock bajo - pronto se agotará";   break;
        default: break;
      }

      const imagen =
        row.IMAGEN_URL && String(row.IMAGEN_URL).trim()
          ? row.IMAGEN_URL
          : `/api/productos/${row.ID}/imagen`;

      return {
        id: row.ID,
        nombre: row.NOMBRE,
        precio: Number(row.PRECIO_VENTA),
        cantidad: Number(row.STOCK_TOTAL || 0),
        fecha_vencimiento: row.PROX_VENC || "N/A",
        imagen,
        unidad_medida: row.UNIDAD_MEDIDA,
        estado: estado || "DISPONIBLE",
        categoriaNombre: row.CATEGORIA_NOMBRE,
        activo: row.ESTADO_ID === 1,
        alerta,
      };
    });

    res.json(productos);
  } catch (error) {
    console.error("Error consultando productos para ventas:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

/* =============================
 *  OBTENER PRODUCTO (detalle)
 * ============================= */
exports.obtenerProducto = async (req, res) => {
  let connection;
  const { id } = req.params;
  try {
    connection = await db.getConnection();

    const query = `
      SELECT 
        p.ID,
        p.NOMBRE,
        p.PRECIO_VENTA,
        p.IMAGEN_URL,
        p.ESTADO_ID,
        u.NOMBRE AS UNIDAD_MEDIDA,
        c.NOMBRE AS CATEGORIA_NOMBRE,
        NVL(agg.STOCK_TOTAL, 0)             AS STOCK_TOTAL,
        TO_CHAR(agg.PROX_VENC,'DD/MM/YYYY') AS PROX_VENC,
        (
          SELECT pe.ESTADO
            FROM POS_PRODUCTO_ESTADO pe
           WHERE pe.PRODUCTO_ID = p.ID
           ORDER BY pe.FECHA_REGISTRO DESC
           FETCH FIRST 1 ROWS ONLY
        ) AS ESTADO_DIN
      FROM POS_PRODUCTO_NUEVO p
      JOIN POS_UNIDAD_MEDIDA u     ON u.ID = p.UNIDAD_MEDIDA_ID
      JOIN POS_CATEGORIAPRODUCTO c ON c.ID = p.CATEGORIA_ID
      LEFT JOIN (
        SELECT PRODUCTO_ID,
               NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
               MIN(FECHA_VENCIMIENTO)          AS PROX_VENC
          FROM POS_PRODUCTO_POR_LOTE
         GROUP BY PRODUCTO_ID
      ) agg ON agg.PRODUCTO_ID = p.ID
      WHERE p.ID = :id
    `;

    const r = await connection.execute(query, { id }, opts());

    if (r.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const row = r.rows[0];
    const imagen =
      row.IMAGEN_URL && String(row.IMAGEN_URL).trim()
        ? row.IMAGEN_URL
        : `/api/productos/${row.ID}/imagen`;

    res.json({
      id: row.ID,
      nombre: row.NOMBRE,
      precio: Number(row.PRECIO_VENTA),
      cantidad: Number(row.STOCK_TOTAL || 0),
      fecha_vencimiento: row.PROX_VENC || "N/A",
      imagen,
      unidad_medida: row.UNIDAD_MEDIDA,
      estado: (row.ESTADO_DIN || "DISPONIBLE").toUpperCase(),
      categoriaNombre: row.CATEGORIA_NOMBRE,
      activo: row.ESTADO_ID === 1,
    });
  } catch (error) {
    console.error("❌ Error obteniendo producto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

/* ================
 *  PROCESAR VENTA
 * ================ */
exports.procesarVenta = async (req, res) => {
  let connection;
  console.log("🟣 [ventas] procesarVenta hit");
  console.time("ventas::procesarVenta");

  try {
    const { usuario_id, caja_id, dinero_recibido, carrito } = req.body;

    if (!usuario_id || !caja_id || dinero_recibido == null || !carrito || carrito.length === 0) {
      return res.status(400).json({ message: "Datos de venta incompletos" });
    }

    // Separar PRODUCTOS vs COMBOS
    const productosItems = [];
    const combosItems = [];
    for (const it of carrito) {
      const esCombo = it.combo_id != null || String(it?.tipo || "").toUpperCase() === "COMBO";
      if (esCombo) {
        combosItems.push({
          combo_id: Number(it.combo_id ?? it.id),
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario ?? it.precio),
        });
      } else {
        productosItems.push({
          producto_id: Number(it.producto_id ?? it.id),
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario ?? it.precio),
        });
      }
    }

    connection = await db.getConnection();

    // Opcional: limitar espera por locks (si tu versión lo soporta)
    try {
      await connection.execute(`ALTER SESSION SET DML_LOCK_TIMEOUT = 3`);
    } catch {
      console.warn("[ventas] DML_LOCK_TIMEOUT no soportado; seguimos sin él.");
    }

    console.time("ventas::cajaAbierta");
    const cajaAbierta = await connection.execute(
      `SELECT COUNT(*) AS TOTAL
         FROM POS_APERTURA_CAJA
        WHERE USUARIO_ID = :usuario_id
          AND CAJA_ID = :caja_id
          AND ESTADO_ID = 1`,
      { usuario_id, caja_id },
      opts()
    );
    console.timeEnd("ventas::cajaAbierta");

    if (Number(cajaAbierta.rows[0]?.TOTAL || 0) === 0) {
      return res.status(400).json({ message: "❌ No tienes ninguna caja abierta para procesar la venta" });
    }

    /* 1) Validaciones previas */

    // 1.1 Productos
    console.time("ventas::validacionesProductos");
    for (const item of productosItems) {
      const est = await connection.execute(
        `SELECT ESTADO FROM (
           SELECT pe.ESTADO
             FROM POS_PRODUCTO_ESTADO pe
            WHERE pe.PRODUCTO_ID = :pid
            ORDER BY pe.FECHA_REGISTRO DESC
         ) WHERE ROWNUM = 1`,
        { pid: item.producto_id },
        opts()
      );
      const estadoDin = String(est.rows[0]?.ESTADO || "").toUpperCase();
      if (estadoDin === "VENCIDO" || estadoDin === "BLOQUEADO") {
        return res.status(400).json({ message: `❌ No se puede vender: el producto está ${estadoDin}.` });
      }

      const r = await connection.execute(
        `SELECT NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK
           FROM POS_PRODUCTO_POR_LOTE
          WHERE PRODUCTO_ID = :id`,
        { id: item.producto_id },
        opts()
      );
      const stock = Number(r.rows[0].STOCK || 0);
      if (item.cantidad > stock) {
        const n = await connection.execute(
          `SELECT NOMBRE FROM POS_PRODUCTO_NUEVO WHERE ID = :id`,
          { id: item.producto_id },
          opts()
        );
        const nom = n.rows[0]?.NOMBRE || `ID ${item.producto_id}`;
        return res.status(409).json({
          message: `❌ Stock insuficiente para "${nom}". Disponible: ${stock}, solicitado: ${item.cantidad}`,
        });
      }
    }
    console.timeEnd("ventas::validacionesProductos");

    // 1.2 Combos
    console.time("ventas::validacionesCombos");
    for (const c of combosItems) {
      const rCombo = await connection.execute(
        `SELECT CANTIDAD_DISPONIBLE, ESTADO_ID
           FROM POS_COMBO
          WHERE ID = :id`,
        { id: c.combo_id },
        opts()
      );
      if (!rCombo.rows.length) {
        return res.status(400).json({ message: `❌ Combo ${c.combo_id} no existe.` });
      }
      const { CANTIDAD_DISPONIBLE, ESTADO_ID } = rCombo.rows[0];
      if (Number(ESTADO_ID) !== 1) {
        return res.status(400).json({ message: "❌ El combo no está activo." });
      }
      if (Number(CANTIDAD_DISPONIBLE) < Number(c.cantidad)) {
        return res.status(409).json({
          message: `❌ Stock insuficiente del combo. Disponible: ${CANTIDAD_DISPONIBLE}, solicitado: ${c.cantidad}`,
        });
      }

      const det = await connection.execute(
        `SELECT d.PRODUCTO_ID,
                d.CANTIDAD,
                p.NOMBRE AS PRODUCTO_NOMBRE,
                (SELECT pe.ESTADO
                   FROM POS_PRODUCTO_ESTADO pe
                  WHERE pe.PRODUCTO_ID = p.ID
                  ORDER BY pe.FECHA_REGISTRO DESC
                  FETCH FIRST 1 ROWS ONLY) AS ESTADO_DIN
           FROM POS_DETALLE_COMBO d
           JOIN POS_PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
          WHERE d.COMBO_ID = :id`,
        { id: c.combo_id },
        opts()
      );

      for (const d of det.rows) {
        const prodId = Number(d.PRODUCTO_ID);
        const prodName = d.PRODUCTO_NOMBRE || `ID ${prodId}`;
        const estadoDin = String(d.ESTADO_DIN || "").toUpperCase();
        if (estadoDin === "VENCIDO" || estadoDin === "BLOQUEADO") {
          return res.status(400).json({ message: `❌ No se puede vender: el producto "${prodName}" está ${estadoDin}.` });
        }

        const requerido = Number(d.CANTIDAD) * Number(c.cantidad);
        const rStock = await connection.execute(
          `SELECT NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK
             FROM POS_PRODUCTO_POR_LOTE
            WHERE PRODUCTO_ID = :pid`,
          { pid: prodId },
          opts()
        );
        const disponible = Number(rStock.rows[0].STOCK || 0);
        if (requerido > disponible) {
          return res.status(409).json({
            message: `❌ Stock insuficiente para "${prodName}". Requerido: ${requerido}, disponible: ${disponible}`,
          });
        }
      }
    }
    console.timeEnd("ventas::validacionesCombos");

    // 2) Total preliminar
    const totalPre = carrito.reduce(
      (acc, it) => acc + Number(it.cantidad) * Number(it.precio_unitario ?? it.precio),
      0
    );
    if (Number(dinero_recibido) < totalPre) {
      return res.status(400).json({ message: "Dinero recibido insuficiente." });
    }

        // 3) Ticket con SEQUENCE
    console.time("ventas::ticketSeq");
    const ticketSeq = await connection.execute(
    `SELECT LPAD(TO_CHAR(SEQ_TICKET_VENTAS.NEXTVAL), 6, '0') AS NUEVO_TICKET FROM DUAL`,
    [],
    opts()
    );
    console.timeEnd("ventas::ticketSeq");
    const codigo_ticket = ticketSeq.rows[0].NUEVO_TICKET;

    // 4) Insert venta SIN ID_VENTA (IDENTITY GENERATED ALWAYS lo crea)
    console.log("ventas::insertVenta — ticket =", codigo_ticket);
    console.time("ventas::insertVenta");
    await connection.execute(
    `INSERT INTO POS_VENTAS
        (USUARIO_ID, CAJA_ID, DINERO_RECIBIDO, CAMBIO, TOTAL, ESTADO_ID, CODIGO_TICKET, FECHA_CREACION)
    VALUES
        (:usuario_id, :caja_id, :dinero_recibido, 0, 0, 1, :codigo_ticket, SYSTIMESTAMP)`,
    {
        usuario_id,
        caja_id,
        dinero_recibido: Number(dinero_recibido),
        codigo_ticket,
    },
    opts()
    );
    console.timeEnd("ventas::insertVenta");

    // 4.1) Recuperar el ID_VENTA recién generado usando el CODIGO_TICKET
    console.time("ventas::fetchIdVenta");
    const qId = await connection.execute(
    `SELECT ID_VENTA
        FROM POS_VENTAS
        WHERE CODIGO_TICKET = :codigo_ticket
        AND USUARIO_ID = :usuario_id
        AND CAJA_ID = :caja_id
        ORDER BY FECHA_CREACION DESC
        FETCH FIRST 1 ROWS ONLY`,
    { codigo_ticket, usuario_id, caja_id },
    opts()
    );
    console.timeEnd("ventas::fetchIdVenta");

    if (!qId.rows.length) {
    throw new Error("No se pudo recuperar el ID de la venta recién insertada.");
    }
    const id_venta = Number(qId.rows[0].ID_VENTA);
    console.log("ventas::id_venta =", id_venta);


    // 🔧 FEFO SIN FOR UPDATE (compatible con vistas):
const consumirPorFEFO = async (productoId, cantidadReq, origen) => {
  let restante = Number(cantidadReq);
  let intentos = 0;

  while (restante > 0) {
    if (++intentos > 200) {
      const err = new Error(`Stock agotado/bloqueado para producto ${productoId}`);
      err.code = "STOCK_CONFLICT";
      throw err;
    }

    // 1) Elegir el lote FEFO (sin FOR UPDATE)
    const sel = await connection.execute(
      `
      SELECT ID_POR_LOTE, CANTIDAD_DISPONIBLE
        FROM POS_PRODUCTO_POR_LOTE
       WHERE PRODUCTO_ID = :pid
         AND CANTIDAD_DISPONIBLE > 0
       ORDER BY FECHA_VENCIMIENTO ASC NULLS LAST,
                FECHA_INGRESO      ASC,
                ID_POR_LOTE        ASC
       FETCH FIRST 1 ROWS ONLY
      `,
      { pid: productoId },
      opts()
    );

    if (sel.rows.length === 0) {
      // No hay más lotes con stock -> inconsistencia respecto a validaciones previas
      const err = new Error(`Inconsistencia: sin lotes disponibles para producto ${productoId}`);
      err.code = "STOCK_CONFLICT";
      throw err;
    }

    const { ID_POR_LOTE, CANTIDAD_DISPONIBLE } = sel.rows[0];
    const disp = Number(CANTIDAD_DISPONIBLE || 0);
    if (disp <= 0) {
      // Otro proceso pudo haberlo consumido; reintentar rápido
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }

    const usar = Math.min(restante, disp);

    // 2) Update condicional: solo descuenta si aún alcanza
    const upd = await connection.execute(
      `UPDATE POS_PRODUCTO_POR_LOTE
          SET CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE - :usar
        WHERE ID_POR_LOTE = :id
          AND CANTIDAD_DISPONIBLE >= :usar`,
      { usar, id: ID_POR_LOTE },
      opts()
    );

    if ((upd.rowsAffected || 0) === 0) {
      // Carrera: otro proceso lo modificó; reintentar
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }

    // 3) Traza por lote
    await connection.execute(
      `INSERT INTO POS_DETALLE_VENTA_LOTE
         (ID_VENTA, PRODUCTO_ID, ID_POR_LOTE, CANTIDAD, ORIGEN)
       VALUES
         (:id_venta, :producto_id, :id_por_lote, :cantidad, :origen)`,
      {
        id_venta,
        producto_id: productoId,
        id_por_lote: ID_POR_LOTE,
        cantidad: usar,
        origen, // 'PRODUCTO' | 'COMBO'
      },
      opts()
    );

    restante -= usar;
  }
};


    // 5.1 Detalle productos
    console.time("ventas::detalleProductos");
    for (const item of productosItems) {
      const cantidad = Number(item.cantidad);
      const punit = Number(item.precio_unitario);
      const subtotal = cantidad * punit;

      await connection.execute(
        `INSERT INTO POS_DETALLE_VENTA
           (ID_VENTA, PRODUCTO_ID, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL_LINEA)
         VALUES
           (:id_venta, :producto_id, :cantidad, :precio_unitario, :subtotal)`,
        { id_venta, producto_id: item.producto_id, cantidad, precio_unitario: punit, subtotal },
        opts()
      );

      await consumirPorFEFO(item.producto_id, cantidad, "PRODUCTO");
    }
    console.timeEnd("ventas::detalleProductos");

    // 5.2 Detalle combos
    console.time("ventas::detalleCombos");
    for (const c of combosItems) {
      const cantidadCombo = Number(c.cantidad);
      const precioUnit = Number(c.precio_unitario);
      const subtotal = cantidadCombo * precioUnit;

      await connection.execute(
        `INSERT INTO POS_VENTA_COMBO
           (ID_VENTA, COMBO_ID, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL_LINEA)
         VALUES
           (:id_venta, :combo_id, :cantidad, :precio_unitario, :subtotal)`,
        { id_venta, combo_id: c.combo_id, cantidad: cantidadCombo, precio_unitario: precioUnit, subtotal },
        opts()
      );

      const upd = await connection.execute(
        `UPDATE POS_COMBO
            SET CANTIDAD_DISPONIBLE = CANTIDAD_DISPONIBLE - :cant
          WHERE ID = :id
            AND CANTIDAD_DISPONIBLE >= :cant`,
        { cant: cantidadCombo, id: c.combo_id },
        opts()
      );
      if ((upd.rowsAffected || 0) === 0) {
        await connection.rollback();
        return res.status(409).json({ message: "Stock insuficiente del combo durante el cobro." });
      }

      const det = await connection.execute(
        `SELECT PRODUCTO_ID, CANTIDAD
           FROM POS_DETALLE_COMBO
          WHERE COMBO_ID = :id`,
        { id: c.combo_id },
        opts()
      );

      for (const d of det.rows) {
        const prodId = Number(d.PRODUCTO_ID);
        const req = Number(d.CANTIDAD) * cantidadCombo;
        if (req > 0) {
          await consumirPorFEFO(prodId, req, "COMBO");
        }
      }
    }
    console.timeEnd("ventas::detalleCombos");

    // 5.3 Total y cambio exactos
    console.time("ventas::recalculoTotal");
    const totRs = await connection.execute(
      `SELECT NVL((SELECT SUM(SUBTOTAL_LINEA) FROM POS_DETALLE_VENTA WHERE ID_VENTA = :id),0)
            + NVL((SELECT SUM(SUBTOTAL_LINEA) FROM POS_VENTA_COMBO   WHERE ID_VENTA = :id),0) AS TOTAL
         FROM DUAL`,
      { id: id_venta },
      opts()
    );
    const totalBD = Number(totRs.rows[0].TOTAL || 0);
    const cambioBD = Number(dinero_recibido) - totalBD;
    console.timeEnd("ventas::recalculoTotal");

    if (cambioBD < 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Dinero recibido insuficiente tras recalcular el total." });
    }

    await connection.execute(
      `UPDATE POS_VENTAS SET TOTAL = :total, CAMBIO = :cambio WHERE ID_VENTA = :id`,
      { total: totalBD, cambio: cambioBD, id: id_venta },
      opts()
    );

    console.time("ventas::commit");
    await connection.commit();
    console.timeEnd("ventas::commit");

    // 6) Resumen para el ticket
    console.time("ventas::resumen");
    const resumenVenta = await connection.execute(
      `SELECT v.CODIGO_TICKET,
              TO_CHAR(v.FECHA_CREACION, 'DD/MM/YYYY') AS FECHA,
              v.TOTAL,
              v.DINERO_RECIBIDO,
              v.CAMBIO,
              u.NOMBRE AS CAJERO,
              c.NOMBRE_CAJA AS CAJA
         FROM POS_VENTAS v
         JOIN USUARIOS u  ON v.USUARIO_ID = u.ID
         JOIN POS_CAJAS c ON v.CAJA_ID   = c.ID_CAJA
        WHERE v.ID_VENTA = :id`,
      { id: id_venta },
      opts()
    );

    const detallesProd = await connection.execute(
      `SELECT p.NOMBRE AS DESCRIPCION,
              dv.CANTIDAD,
              dv.PRECIO_UNITARIO,
              dv.SUBTOTAL_LINEA
         FROM POS_DETALLE_VENTA dv
         JOIN POS_PRODUCTO_NUEVO p ON p.ID = dv.PRODUCTO_ID
        WHERE dv.ID_VENTA = :id`,
      { id: id_venta },
      opts()
    );

    const detallesCombo = await connection.execute(
      `SELECT cb.NOMBRE AS DESCRIPCION,
              vc.CANTIDAD,
              vc.PRECIO_UNITARIO,
              vc.SUBTOTAL_LINEA
         FROM POS_VENTA_COMBO vc
         JOIN POS_COMBO cb ON vc.COMBO_ID = cb.ID
        WHERE vc.ID_VENTA = :id`,
      { id: id_venta },
      opts()
    );
    console.timeEnd("ventas::resumen");

    console.timeEnd("ventas::procesarVenta");
    res.json({
      id_venta,
      venta: resumenVenta.rows[0],
      detalles: [...detallesProd.rows, ...detallesCombo.rows],
    });
  } catch (error) {
    console.error("❌ Error procesando venta:", error);
    if (connection) try { await connection.rollback(); } catch {}
    if (error && error.code === "STOCK_CONFLICT") {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: error?.message || "Error procesando venta" });
  } finally {
    if (connection) try { await connection.close(); } catch {}
  }
};

//export para las imagenes
// === GET /api/personal-ventas/productos/:id/imagen  (sirve BLOB del producto) ===
exports.imagenProducto = async (req, res) => {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).end();

    connection = await db.getConnection();

    const r = await connection.execute(
      `SELECT IMAGEN_MIME, IMAGEN_BLOB
         FROM POS_PRODUCTO_NUEVO
        WHERE ID = :id`,
      { id },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { IMAGEN_BLOB: { type: oracledb.BUFFER } }, // <- BLOB como Buffer
      }
    );

    if (!r.rows?.length || !r.rows[0]?.IMAGEN_BLOB) return res.status(404).end();

    const mime = r.rows[0].IMAGEN_MIME || "application/octet-stream";
    res.set("Content-Type", mime);
    res.send(r.rows[0].IMAGEN_BLOB);
  } catch (e) {
    console.error("[imagenProducto]", e);
    res.status(500).end();
  } finally {
    try { await connection?.close(); } catch {}
  }
};

