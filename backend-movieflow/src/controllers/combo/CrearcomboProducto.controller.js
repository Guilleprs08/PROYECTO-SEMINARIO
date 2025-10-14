// src/controllers/combo/CrearcomboProducto.controller.js
const db = require('../../config/db');
const oracledb = require('oracledb');
const xss = require('xss');

oracledb.fetchAsBuffer = [oracledb.BLOB];
const OUT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// 👉 categoría fija para combos
const COMBO_CAT_ID = 1;

/** ==========================
 * Helpers
 * ========================== */
async function assertNombreUnicoPorCategoria(cn, { nombre, categoriaId, excludeId = null }) {
  const binds = { nombre, categoriaId };
  let extra = '';
  if (excludeId) { extra = 'AND c.ID <> :excludeId'; binds.excludeId = excludeId; }

  const sql = `
    SELECT 1
      FROM POS_COMBO c
     WHERE c.CATEGORIA_ID = :categoriaId
       AND NLSSORT(c.NOMBRE,'NLS_SORT=BINARY_AI') = NLSSORT(:nombre,'NLS_SORT=BINARY_AI')
     ${extra}
     FETCH FIRST 1 ROWS ONLY
  `;
  const rs = await cn.execute(sql, binds);
  if (rs.rows?.length) {
    const err = new Error('Ya existe un combo con ese nombre en la categoría.');
    err.status = 409;
    throw err;
  }
}

async function getStockDisponibleMap(cn, productoIds = []) {
  if (!productoIds.length) return new Map();

  const binds = Object.fromEntries(productoIds.map((v, i) => [`p${i}`, Number(v)]));
  const marks = productoIds.map((_v, i) => `:p${i}`).join(',');

  const sql = `
    SELECT PRODUCTO_ID, SUM(CANTIDAD_DISPONIBLE) AS DISPONIBLE
      FROM POS_PRODUCTO_POR_LOTE
     WHERE PRODUCTO_ID IN (${marks})
       AND CANTIDAD_DISPONIBLE > 0
     GROUP BY PRODUCTO_ID
  `;
  const rs = await cn.execute(sql, binds, OUT);
  return new Map((rs.rows || []).map(r => [Number(r.PRODUCTO_ID), Number(r.DISPONIBLE || 0)]));
}

/* =========================
 *  GET /api/categoria-combo
 * ========================= */
exports.listarCategoriasCombo = async (_req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT ID, CODIGO, NOMBRE, FECHA_CREACION
         FROM POS_CATEGORIA_COMBO
        ORDER BY ID DESC`,
      {}, OUT
    );
    res.status(200).json((rs.rows || []).map(r => ({
      ID: r.ID, CODIGO: r.CODIGO, NOMBRE: r.NOMBRE, FECHA_CREACION: r.FECHA_CREACION
    })));
  } catch (error) {
    console.error('❌ Error listando POS_CATEGORIA_COMBO:', error);
    res.status(500).json({ message: 'Error al obtener categorías de combo.' });
  } finally {
    if (cn) await cn.close();
  }
};

/* =========================
 *  POST /api/combos  (multipart)
 *  Guarda imagen en BLOB y setea IMAGEN_URL = /api/combos/:id/imagen
 * ========================= */
exports.crearComboProducto = async (req, res) => {
  let { nombre, descripcion, precioVenta, estado, usuarioId, items, cantidadDisponible } = req.body;

  // Normalizar / sanitizar
  nombre              = xss(String(nombre || '').trim().replace(/\s+/g, ' '));
  descripcion         = xss(String(descripcion || '').trim());
  precioVenta         = Number(String(precioVenta ?? 0).replace(',', '.'));
  estado              = Number(estado) || null;
  usuarioId           = Number(usuarioId) || null;
  cantidadDisponible  = Number.isFinite(Number(cantidadDisponible)) ? Math.max(0, Number(cantidadDisponible)) : 0;

  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  items = Array.isArray(items) ? items : [];

  if (!nombre)            return res.status(400).json({ message: 'El nombre es requerido.' });
  if (!(precioVenta > 0)) return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0.' });
  if (!estado)            return res.status(400).json({ message: 'El estado es requerido.' });
  if (!usuarioId)         return res.status(400).json({ message: 'El usuario es requerido.' });
  if (!req.file)          return res.status(400).json({ message: 'La imagen es obligatoria.' });

  if (items.length < 2) return res.status(400).json({ message: 'El combo debe incluir al menos 2 productos.' });
  if (items.length > 5) return res.status(400).json({ message: 'El combo no puede tener más de 5 productos.' });
  for (const it of items) {
    if (!it || !Number(it.productoId)) {
      return res.status(400).json({ message: 'Items inválidos. Verifica productoId.' });
    }
  }

  const MIN_PCT = 0.50;  // precio combo ≥ 50% de suma componentes
  const EPS     = 0.005;

  let cn;
  try {
    cn = await db.getConnection();

    // 1) Existe categoría
    const cat = await cn.execute(
      `SELECT 1 FROM POS_CATEGORIA_COMBO WHERE ID = :id`,
      { id: COMBO_CAT_ID }, OUT
    );
    if ((cat.rows || []).length === 0) {
      return res.status(400).json({ message: `La categoría de combo (ID=${COMBO_CAT_ID}) no existe.` });
    }

    // 2) Unicidad
    await assertNombreUnicoPorCategoria(cn, { nombre, categoriaId: COMBO_CAT_ID });

    // 3) Traer precios de productos
    const ids   = items.map(i => Number(i.productoId));
    const binds = Object.fromEntries(ids.map((v, i) => [`p${i}`, v]));
    const marks = ids.map((_v, i) => `:p${i}`).join(',');

    const rsProd = await cn.execute(
      `SELECT ID, NOMBRE, PRECIO_VENTA
         FROM POS_PRODUCTO_NUEVO
        WHERE ID IN (${marks})`,
      binds, OUT
    );

    const priceById = new Map((rsProd.rows || []).map(r => [Number(r.ID), Number(r.PRECIO_VENTA || 0)]));
    const nameById  = new Map((rsProd.rows || []).map(r => [Number(r.ID), String(r.NOMBRE || '')]));

    let suma = 0;
    for (const it of items) {
      const pid = Number(it.productoId);
      const pu  = priceById.get(pid);
      if (pu == null) {
        const nf = nameById.get(pid) || `ID ${pid}`;
        return res.status(400).json({ message: `El producto componente "${nf}" no existe.` });
      }
      suma += pu * 1; // cantidad fija = 1
    }

    if (suma > 0) {
      if (precioVenta - suma > EPS) {
        return res.status(400).json({ message: `El precio del combo (Q${precioVenta.toFixed(2)}) no puede exceder la suma de componentes (Q${suma.toFixed(2)}).` });
      }
      const minPermitido = suma * MIN_PCT;
      if (minPermitido - precioVenta > EPS) {
        return res.status(400).json({ message: `El precio del combo (Q${precioVenta.toFixed(2)}) es menor al mínimo permitido (Q${minPermitido.toFixed(2)}).` });
      }
    }

    // 4) Insert cabecera con BLOB
    const insHead = await cn.execute(
      `INSERT INTO POS_COMBO
         (CATEGORIA_ID, NOMBRE, DESCRIPCION, PRECIO_VENTA,
          ESTADO_ID, USUARIO_ID, FECHA_CREACION, CANTIDAD_DISPONIBLE,
          IMAGEN_BLOB, IMAGEN_MIME, IMAGEN_NOMBRE, IMAGEN_URL)
       VALUES
         (:categoria, :nombre, :descripcion, :precio,
          :estado, :usuario, SYSDATE, :cantDisp,
          :imgBlob, :imgMime, :imgName, NULL)
       RETURNING ID INTO :id`,
      {
        categoria: COMBO_CAT_ID,
        nombre,
        descripcion: descripcion || null,
        precio: precioVenta,
        estado,
        usuario: usuarioId,
        cantDisp: cantidadDisponible,
        imgBlob: req.file.buffer,
        imgMime: req.file.mimetype || 'application/octet-stream',
        imgName: req.file.originalname || `combo_${Date.now()}`,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );

    const comboId = insHead.outBinds.id[0];

    // 5) Detalle (cantidad fija = 1)
    const rows = items.map(it => ({
      combo: comboId,
      prod:  Number(it.productoId),
      cant:  1,
      snap:  Number(priceById.get(Number(it.productoId)) || 0)
    }));
    await cn.executeMany(
      `INSERT INTO POS_DETALLE_COMBO
         (COMBO_ID, PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP)
       VALUES (:combo, :prod, :cant, :snap)`,
      rows,
      {
        autoCommit: false,
        bindDefs: {
          combo: { type: oracledb.NUMBER },
          prod:  { type: oracledb.NUMBER },
          cant:  { type: oracledb.NUMBER },
          snap:  { type: oracledb.NUMBER }
        }
      }
    );

    // 6) URL para servir el BLOB
    const imagenURL = `/api/combos/${comboId}/imagen`;
    await cn.execute(
      `UPDATE POS_COMBO SET IMAGEN_URL = :url WHERE ID = :id`,
      { url: imagenURL, id: comboId },
      { autoCommit: false }
    );

    await cn.commit();

    return res.status(201).json({
      id: comboId,
      message: 'Combo creado correctamente.',
      imagen: imagenURL,
      cantidadDisponible
    });

  } catch (error) {
    try { if (cn) await cn.rollback(); } catch {}
    if (error?.status) return res.status(error.status).json({ message: error.message });
    console.error('❌ Error al crear combo:', error);
    return res.status(500).json({ message: 'Error al crear combo.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* =========================
 *  GET /api/combos
 * ========================= */
exports.listarCombos = async (req, res) => {
  const categoriaId = Number(req.query.categoriaId) || null;
  const q = (req.query.q || '').trim().toLowerCase();

  let cn;
  try {
    cn = await db.getConnection();

    const where = [];
    const binds = {};
    if (categoriaId) { where.push('c.CATEGORIA_ID = :cat'); binds.cat = categoriaId; }
    if (q) { where.push('(LOWER(c.NOMBRE) LIKE :q OR LOWER(c.DESCRIPCION) LIKE :q)'); binds.q = `%${q}%`; }

    const sql = `
      SELECT
        c.ID, c.NOMBRE, c.DESCRIPCION, c.PRECIO_VENTA,
        c.IMAGEN_URL, c.ESTADO_ID, c.CATEGORIA_ID,
        c.CANTIDAD_DISPONIBLE,
        cc.NOMBRE AS CATEGORIA_NOMBRE,
        TO_CHAR(c.FECHA_CREACION, 'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION
      FROM POS_COMBO c
      LEFT JOIN POS_CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.ID DESC
    `;
    const rs = await cn.execute(sql, binds, OUT);

    const data = (rs.rows || []).map(r => {
      const precioNum = Number(r.PRECIO_VENTA ?? 0);
      const cant      = Number(r.CANTIDAD_DISPONIBLE ?? 0);
      return {
        id: Number(r.ID),
        nombre: r.NOMBRE,
        descripcion: r.DESCRIPCION || '',
        precio: precioNum,
        precioVenta: precioNum,
        imagen: r.IMAGEN_URL || `/api/combos/${r.ID}/imagen`,
        estado: Number(r.ESTADO_ID || 0),
        categoriaId: Number(r.CATEGORIA_ID || 0),
        categoriaNombre: r.CATEGORIA_NOMBRE || '',
        fechaCreacion: r.FECHA_CREACION,
        cantidadDisponible: cant,
        cantidadDisponibleTexto: `cantidad disponible : ${cant}`
      };
    });

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error listando combos:', error);
    res.status(500).json({ message: 'Error al obtener combos.' });
  } finally {
    if (cn) await cn.close();
  }
};

/* =========================
 *  GET /api/combos/buscar
 * ========================= */
exports.buscarCombos = async (req, res) => {
  const qRaw   = (req.query.q || '').trim();
  const catId  = Number(req.query.categoriaId) || null;
  const limit  = Math.max(0, Number(req.query.limit)  || 100);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let cn;
  try {
    cn = await db.getConnection();

    if (qRaw) {
      await cn.execute(`ALTER SESSION SET NLS_COMP = LINGUISTIC`);
      await cn.execute(`ALTER SESSION SET NLS_SORT = BINARY_AI`);
    }

    const where = [];
    const binds = { off: offset, lim: limit };

    if (catId) { where.push(`c.CATEGORIA_ID = :catId`); binds.catId = catId; }
    if (qRaw)  { where.push(`( c.NOMBRE LIKE :q OR c.DESCRIPCION LIKE :q )`); binds.q = `%${qRaw}%`; }
    where.push(`c.ESTADO_ID = 1`);

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT *
      FROM (
        SELECT
          c.ID, c.NOMBRE, c.DESCRIPCION, c.PRECIO_VENTA,
          c.IMAGEN_URL,
          c.ESTADO_ID, c.CATEGORIA_ID, c.CANTIDAD_DISPONIBLE,
          cc.NOMBRE AS CATEGORIA_NOMBRE,
          TO_CHAR(c.FECHA_CREACION, 'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION,
          ROW_NUMBER() OVER (ORDER BY c.ID DESC) AS RN
        FROM POS_COMBO c
        LEFT JOIN POS_CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
        ${whereClause}
      )
      WHERE RN > :off AND RN <= :off + :lim
    `;

    const rs = await cn.execute(sql, binds, OUT);

    const data = (rs.rows || []).map(r => {
      const precioNum = Number(r.PRECIO_VENTA ?? 0);
      const cant      = Number(r.CANTIDAD_DISPONIBLE ?? 0);
      return {
        id: Number(r.ID),
        nombre: r.NOMBRE,
        descripcion: r.DESCRIPCION || '',
        precio: precioNum,
        precioVenta: precioNum,
        imagen: r.IMAGEN_URL || `/api/combos/${r.ID}/imagen`,
        estado: Number(r.ESTADO_ID || 0),
        categoriaId: Number(r.CATEGORIA_ID || 0),
        categoriaNombre: r.CATEGORIA_NOMBRE || '',
        fechaCreacion: r.FECHA_CREACION,
        cantidadDisponible: cant,
        cantidadDisponibleTexto: `cantidad disponible : ${cant}`
      };
    });

    res.status(200).json(data);
  } catch (err) {
    console.error('❌ Error buscando combos:', err);
    res.status(500).json({ message: 'Error al buscar combos.' });
  } finally {
    if (cn) { try { await cn.close(); } catch {} }
  }
};

/* =========================
 *  GET /api/combos/:id  (cabecera + items)
 * ========================= */
exports.obtenerComboCompleto = async (req, res) => {
  const comboId = Number(req.params.id) || 0;
  if (!comboId) return res.status(400).json({ message: 'ID de combo inválido' });

  let cn;
  try {
    cn = await db.getConnection();

    const headSQL = `
      SELECT
        c.ID, c.NOMBRE, c.DESCRIPCION, c.PRECIO_VENTA, c.ESTADO_ID,
        c.IMAGEN_URL, c.CATEGORIA_ID, c.CANTIDAD_DISPONIBLE,
        cc.NOMBRE AS CATEGORIA_NOMBRE, c.USUARIO_ID,
        TO_CHAR(c.FECHA_CREACION,'YYYY-MM-DD HH24:MI:SS') AS FECHA_CREACION
      FROM POS_COMBO c
      LEFT JOIN POS_CATEGORIA_COMBO cc ON cc.ID = c.CATEGORIA_ID
      WHERE c.ID = :id
    `;
    const headRs = await cn.execute(headSQL, { id: comboId }, OUT);
    if (headRs.rows.length === 0) return res.status(404).json({ message: 'Combo no encontrado' });

    const h = headRs.rows[0];
    const cant = Number(h.CANTIDAD_DISPONIBLE || 0);
    const head = {
      id: Number(h.ID),
      nombre: h.NOMBRE,
      descripcion: h.DESCRIPCION || '',
      precio: Number(h.PRECIO_VENTA),
      precioVenta: Number(h.PRECIO_VENTA),
      estadoId: Number(h.ESTADO_ID),
      imagen: h.IMAGEN_URL || `/api/combos/${h.ID}/imagen`,
      categoriaId: Number(h.CATEGORIA_ID || 0),
      categoriaNombre: h.CATEGORIA_NOMBRE || '',
      usuarioId: Number(h.USUARIO_ID || 0),
      fechaCreacion: h.FECHA_CREACION,
      cantidadDisponibleTexto: `cantidad disponible : ${cant}`
    };

    const detSQL = `
      SELECT
        d.ID               AS DETALLE_ID,
        d.PRODUCTO_ID      AS PRODUCTO_ID,
        p.NOMBRE           AS PRODUCTO_NOMBRE,
        p.IMAGEN_URL       AS PRODUCTO_IMAGEN,
        d.CANTIDAD         AS CANTIDAD,
        d.PRECIO_UNIT_SNAP AS PRECIO_UNIT_SNAP
      FROM POS_DETALLE_COMBO d
      JOIN POS_PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
      WHERE d.COMBO_ID = :id
      ORDER BY d.ID
    `;
    const detRs = await cn.execute(detSQL, { id: comboId }, OUT);

    const items = (detRs.rows || []).map(r => {
      const cantidad = Number(r.CANTIDAD);
      const pu = Number(r.PRECIO_UNIT_SNAP);
      const prodImg = r.PRODUCTO_IMAGEN || `/api/productos/${r.PRODUCTO_ID}/imagen`;
      return {
        detalleId: Number(r.DETALLE_ID),
        productoId: Number(r.PRODUCTO_ID),
        nombre: r.PRODUCTO_NOMBRE,
        imagen: prodImg,
        cantidad,
        precioUnitSnap: pu,
        subtotalSnap: +(cantidad * pu).toFixed(2),
      };
    });

    const sumaComponentes = +items.reduce((acc, it) => acc + it.subtotalSnap, 0).toFixed(2);
    const ahorroEstimado  = +(sumaComponentes - head.precioVenta).toFixed(2);

    return res.status(200).json({
      ...head,
      items,
      totales: {
        sumaComponentes,
        precioCombo: head.precioVenta,
        ahorroEstimado,
      },
    });
  } catch (err) {
    console.error('❌ Error obteniendo combo completo:', err);
    res.status(500).json({ message: 'Error al obtener combo.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

// Alias opcional
exports.obtenerComboPorId = exports.obtenerComboCompleto;

/* =========================
 *  PUT /api/combos/:id/cabecera
 *  (actualiza cabecera, detalle upsert y BLOB opcional)
 * ========================= */
exports.actualizarComboCabecera = async (req, res) => {
  const comboId = Number(req.params.id) || 0;
  if (!comboId) return res.status(400).json({ message: "ID de combo inválido" });

  const autoAjustarPrecio =
    String(req.query?.autoAjustarPrecio ?? req.body?.autoAjustarPrecio ?? "0") === "1";

  let {
    nombre,
    descripcion,
    precioVenta,
    estadoId,
    categoriaId,
    usuarioId,
    itemsUpsert,
    cantidadDisponibleDelta,
    cantidadDisponible
  } = req.body || {};

  if (typeof itemsUpsert === "string") {
    try { itemsUpsert = JSON.parse(itemsUpsert); }
    catch { return res.status(400).json({ message: "itemsUpsert debe ser JSON válido." }); }
  }
  if (itemsUpsert != null && !Array.isArray(itemsUpsert)) {
    return res.status(400).json({ message: "itemsUpsert debe ser un arreglo." });
  }

  if (typeof nombre === "string")      nombre      = xss(nombre.trim());
  if (typeof descripcion === "string") descripcion = xss(descripcion.trim());

  if (precioVenta != null) precioVenta = Number(String(precioVenta).replace(",", "."));
  if (estadoId    != null) estadoId    = Number(estadoId);
  if (categoriaId != null) categoriaId = Number(categoriaId);
  if (usuarioId   != null) usuarioId   = Number(usuarioId);
  if (precioVenta != null && !(precioVenta > 0)) {
    return res.status(400).json({ message: "precioVenta debe ser > 0" });
  }

  // Items: cantidad fija = 1
  if (Array.isArray(itemsUpsert)) {
    const comp = new Map();
    for (const it of itemsUpsert) {
      const pid = Number(it?.productoId);
      if (!pid) return res.status(400).json({ message: "itemsUpsert contiene elementos inválidos (productoId requerido)." });
      comp.set(pid, 1);
    }
    itemsUpsert = Array.from(comp.keys()).map(pid => ({ productoId: pid, cantidad: 1 }));
  }

  const MIN_PCT = 0.50;
  const EPS     = 0.005;

  let cn;
  try {
    cn = await db.getConnection();

    // 1) Cabecera y detalle actual
    const rsCombo = await cn.execute(
      `SELECT NOMBRE, DESCRIPCION, PRECIO_VENTA, ESTADO_ID, CATEGORIA_ID, USUARIO_ID, CANTIDAD_DISPONIBLE
         FROM POS_COMBO WHERE ID = :id`,
      { id: comboId }, OUT
    );
    if (rsCombo.rows.length === 0) return res.status(404).json({ message: "Combo no encontrado" });
    const current = rsCombo.rows[0];
    const precioActual = Number(current.PRECIO_VENTA);
    const cantDispActual = Number(current.CANTIDAD_DISPONIBLE || 0);

    const rsDet = await cn.execute(
      `SELECT PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP
         FROM POS_DETALLE_COMBO WHERE COMBO_ID = :id`,
      { id: comboId }, OUT
    );
    const detActual = new Map(
      (rsDet.rows || []).map(r => [ Number(r.PRODUCTO_ID), {
        cantidad: Number(r.CANTIDAD),
        precioUnitSnap: Number(r.PRECIO_UNIT_SNAP)
      }])
    );

    if (nombre != null || categoriaId != null) {
      await assertNombreUnicoPorCategoria(cn, {
        nombre:      nombre      != null ? nombre      : current.NOMBRE,
        categoriaId: categoriaId != null ? categoriaId : current.CATEGORIA_ID,
        excludeId: comboId
      });
    }

    // 2) Preparar inserts/updates detalle (fijo = 1)
    const detResult = new Map(detActual);
    const toInsert = [], toUpdate = [];
    if (Array.isArray(itemsUpsert) && itemsUpsert.length) {
      for (const it of itemsUpsert) {
        const pid  = Number(it.productoId);
        const cant = 1;
        const cur = detResult.get(pid);
        if (!cur) {
          detResult.set(pid, { cantidad: cant, precioUnitSnap: cur?.precioUnitSnap ?? null });
          toInsert.push({ combo: comboId, prod: pid, cant });
        } else if (Number(cur.cantidad) !== cant) {
          detResult.set(pid, { cantidad: cant, precioUnitSnap: cur.precioUnitSnap });
          toUpdate.push({ combo: comboId, prod: pid, cant, snap: Number(cur.precioUnitSnap) });
        }
      }
    }

    const finalCount = detResult.size;
    if (finalCount > 5) return res.status(400).json({ message: "El combo no puede tener más de 5 productos." });
    if (finalCount < 2) return res.status(400).json({ message: "El combo debe incluir al menos 2 productos." });

    // 3) Imagen nueva? (BLOB)
    const hasFile = !!req.file;

    // 4) Transacción
    await cn.execute("SAVEPOINT sp_upd_combo");

    if (toInsert.length) {
      await cn.executeMany(
        `INSERT INTO POS_DETALLE_COMBO (COMBO_ID, PRODUCTO_ID, CANTIDAD, PRECIO_UNIT_SNAP)
         SELECT :combo, :prod, :cant, (SELECT PRECIO_VENTA FROM POS_PRODUCTO_NUEVO WHERE ID = :prod)
         FROM DUAL`,
        toInsert,
        { autoCommit: false,
          bindDefs: { combo:{type:oracledb.NUMBER}, prod:{type:oracledb.NUMBER}, cant:{type:oracledb.NUMBER} }
        }
      );
    }
    if (toUpdate.length) {
      await cn.executeMany(
        `UPDATE POS_DETALLE_COMBO
            SET CANTIDAD = :cant
          WHERE COMBO_ID = :combo AND PRODUCTO_ID = :prod`,
        toUpdate,
        { autoCommit: false,
          bindDefs: { combo:{type:oracledb.NUMBER}, prod:{type:oracledb.NUMBER}, cant:{type:oracledb.NUMBER} }
        }
      );
    }

    // 5) Suma de componentes (con precios actuales)
    const sumQ = await cn.execute(
      `SELECT NVL(SUM(d.CANTIDAD * p.PRECIO_VENTA), 0) AS SUMA
         FROM POS_DETALLE_COMBO d
         JOIN POS_PRODUCTO_NUEVO p ON p.ID = d.PRODUCTO_ID
        WHERE d.COMBO_ID = :id`,
      { id: comboId }, OUT
    );
    const sumaBD = Number(sumQ?.rows?.[0]?.SUMA || 0);
    const minPermitido = +(sumaBD * MIN_PCT).toFixed(2);
    const maxPermitido = +sumaBD.toFixed(2);

    // 6) Build UPDATE cabecera
    const sets = [];
    const binds = { id: comboId };
    const changed = (oldV, newV) => {
      if (newV == null) return false;
      if (typeof oldV === "number" || typeof newV === "number") {
        const a = Number(oldV), b = Number(newV);
        return !(Number.isFinite(a) && Number.isFinite(b) && a === b);
      }
      return String(oldV ?? "") !== String(newV ?? "");
    };

    if (changed(current.NOMBRE,        nombre))      { sets.push("NOMBRE = :nombre");             binds.nombre = nombre; }
    if (changed(current.DESCRIPCION,   descripcion)) { sets.push("DESCRIPCION = :descripcion");   binds.descripcion = descripcion; }
    if (changed(current.ESTADO_ID,     estadoId))    { sets.push("ESTADO_ID = :estadoId");        binds.estadoId = estadoId; }
    if (changed(current.CATEGORIA_ID,  categoriaId)) { sets.push("CATEGORIA_ID = :categoriaId");  binds.categoriaId = categoriaId; }
    if (changed(current.USUARIO_ID,    usuarioId))   { sets.push("USUARIO_ID = :usuarioId");      binds.usuarioId = usuarioId; }

    // Cantidad disponible (acepta delta o valor absoluto)
    const deltaRaw = (cantidadDisponibleDelta ?? cantidadDisponible);
    const delta = (deltaRaw != null) ? Number(String(deltaRaw).replace(",", ".")) : null;
    let nuevaCantidadDisponible = cantDispActual;
    if (Number.isFinite(delta)) {
      nuevaCantidadDisponible = Math.max(0, Math.trunc(cantDispActual + delta));
      sets.push("CANTIDAD_DISPONIBLE = :cantDisp");
      binds.cantDisp = nuevaCantidadDisponible;
    }

    // Política de precio
    let precioFinal = precioVenta != null ? Number(precioVenta) : null;
    if (precioFinal != null) {
      if (autoAjustarPrecio) {
        const clamped = Math.min(Math.max(precioFinal, minPermitido), maxPermitido);
        sets.push("PRECIO_VENTA = :precioVenta"); binds.precioVenta = clamped;
      } else {
        if (precioFinal - maxPermitido > EPS)
          return res.status(400).json({ code:'PRECIO_SUPERA_SUMA', message:'El precio del combo no puede exceder la suma de componentes.',
            rangoPermitido:{ minimo:minPermitido, maximo:maxPermitido } });
        if (minPermitido - precioFinal > EPS)
          return res.status(400).json({ code:'PRECIO_POR_DEBAJO_MINIMO', message:'El precio del combo es menor al mínimo permitido.',
            rangoPermitido:{ minimo:minPermitido, maximo:maxPermitido } });
        sets.push("PRECIO_VENTA = :precioVenta"); binds.precioVenta = precioFinal;
      }
    } else if (minPermitido - precioActual > EPS) {
      return res.status(400).json({
        code: "PRECIO_ACTUAL_INSUFICIENTE",
        message: `El precio actual del combo (Q${precioActual.toFixed(2)}) queda por debajo del mínimo (Q${minPermitido.toFixed(2)}) con el nuevo detalle.`,
        accionRequerida: "Envía 'precioVenta' dentro del rango o activa 'autoAjustarPrecio=1'.",
        rangoPermitido: { minimo: minPermitido, maximo: maxPermitido }
      });
    }

    // Imagen nueva → BLOB + URL
    if (hasFile) {
      sets.push("IMAGEN_BLOB = :imgBlob");
      sets.push("IMAGEN_MIME = :imgMime");
      sets.push("IMAGEN_NOMBRE = :imgName");
      sets.push("IMAGEN_URL = :imgUrl");
      binds.imgBlob = req.file.buffer;
      binds.imgMime = req.file.mimetype || 'application/octet-stream';
      binds.imgName = req.file.originalname || `combo_${Date.now()}`;
      binds.imgUrl  = `/api/combos/${comboId}/imagen`;
    }

    if (sets.length) {
      await cn.execute(`UPDATE POS_COMBO SET ${sets.join(", ")} WHERE ID = :id`, binds, { autoCommit: false });
    } else {
      // nada para cambiar
      await cn.rollback();
      return res.status(200).json({ message: "Sin cambios" });
    }

    await cn.commit();

    return res.status(200).json({
      message: "Combo actualizado correctamente.",
      cantidadDisponible: nuevaCantidadDisponible
    });

  } catch (err) {
    try { if (cn) await cn.rollback(); } catch {}
    console.error("❌ Error actualizando cabecera de combo:", err);
    return res.status(500).json({ message: "Error al actualizar combo." });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/* =========================
 *  GET /api/combos/:id/imagen  (servir BLOB)
 * ========================= */
exports.getImagenCombo = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).end();

    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT IMAGEN_MIME, IMAGEN_BLOB FROM POS_COMBO WHERE ID = :id`,
      { id }, OUT
    );
    if (!rs.rows.length || !rs.rows[0].IMAGEN_BLOB) return res.status(404).end();

    const mime = rs.rows[0].IMAGEN_MIME || 'application/octet-stream';
    res.set('Content-Type', mime);
    res.send(rs.rows[0].IMAGEN_BLOB);
  } catch (err) {
    console.error('❌ Error obteniendo imagen de combo:', err);
    res.status(500).end();
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
