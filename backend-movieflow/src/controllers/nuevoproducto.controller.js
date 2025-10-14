// backend-movieflow/src/controllers/nuevoproducto.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');
const xss = require('xss');

oracledb.fetchAsBuffer = [oracledb.BLOB];
const OUT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const clean = (s) => (s == null ? '' : String(s).trim().replace(/\s+/g, ' '));
const buildImgURL = (id) => `/api/nuevoproducto/${id}/imagen`;

/* =========================
 *  Crear producto (imagen en BLOB)
 * ========================= */
exports.crearProducto = async (req, res) => {
  let { nombre, precioVenta, categoria, unidad, estado, usuarioId } = req.body;

  nombre = xss(clean(nombre || ''));
  precioVenta = Number(precioVenta) || 0;
  categoria = Number(categoria) || null;
  unidad = Number(unidad) || null;
  estado = Number(estado) || null;
  usuarioId = Number(usuarioId) || null;

  let cn;
  try {
    cn = await db.getConnection();

    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' });
    if (!categoria) return res.status(400).json({ message: 'La categoría es requerida.' });
    if (!unidad) return res.status(400).json({ message: 'La unidad de medida es requerida.' });
    if (!estado) return res.status(400).json({ message: 'El estado es requerido.' });
    if (!usuarioId) return res.status(400).json({ message: 'El usuario es requerido.' });
    if (precioVenta <= 0)
      return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0.' });
    if (!req.file)
      return res.status(400).json({ message: 'La imagen es obligatoria.' });

    // Duplicados por nombre y categoría
    const dupCheck = await cn.execute(
      `SELECT 1
         FROM POS_PRODUCTO_NUEVO
        WHERE LOWER(NOMBRE) = LOWER(:nombre)
          AND CATEGORIA_ID  = :categoria`,
      { nombre, categoria },
      OUT
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({
        message: 'Ya existe un producto con ese nombre en esta categoría.',
      });
    }

    // Insert principal
    const ins = await cn.execute(
      `INSERT INTO POS_PRODUCTO_NUEVO
         (NOMBRE, CATEGORIA_ID, UNIDAD_MEDIDA_ID,
          STOCK_MINIMO, PRECIO_VENTA,
          IMAGEN_BLOB, IMAGEN_MIME, IMAGEN_NOMBRE,
          IMAGEN_URL,
          USUARIO_ID, FECHA_REGISTRO, ESTADO_ID, DESCRIPCION)
       VALUES
         (:nombre, :categoria, :unidad,
          0, :precioVenta,
          :imgBlob, :imgMime, :imgName,
          NULL,
          :usuarioId, SYSDATE, :estado, NULL)
       RETURNING ID INTO :id`,
      {
        nombre,
        categoria,
        unidad,
        precioVenta,
        imgBlob: req.file.buffer,
        imgMime: req.file.mimetype || 'application/octet-stream',
        imgName: clean(req.file.originalname || `img_${Date.now()}`),
        usuarioId,
        estado,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );

    const productoId = ins.outBinds.id[0];
    const imagenURL = buildImgURL(productoId);

    // Guardar URL “oficial”
    await cn.execute(
      `UPDATE POS_PRODUCTO_NUEVO
          SET IMAGEN_URL = :url
        WHERE ID = :id`,
      { url: imagenURL, id: productoId },
      { autoCommit: false }
    );

    await cn.commit();

    res.status(201).json({
      id: productoId,
      message: 'Producto creado correctamente.',
      imagen: imagenURL,
    });
  } catch (error) {
    if (cn) try { await cn.rollback(); } catch {}
    console.error('❌ Error al crear producto:', error);
    res.status(500).json({
      message: 'Error al crear producto.',
      oracleCode: error?.code,
      oracleNum: error?.errorNum,
    });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* =========================
 *  Servir imagen almacenada (BLOB)
 *  GET /api/nuevoproducto/:id/imagen
 * ========================= */
exports.getImagenProducto = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).end();

    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT IMAGEN_MIME, IMAGEN_BLOB
         FROM POS_PRODUCTO_NUEVO
        WHERE ID = :id`,
      { id },
      OUT
    );

    if (!rs.rows.length || !rs.rows[0].IMAGEN_BLOB) {
      return res.status(404).end();
    }

    const mime = rs.rows[0].IMAGEN_MIME || 'application/octet-stream';
    res.set('Content-Type', mime);
    // Evita cache agresivo del navegador
    res.set('Cache-Control', 'no-store, max-age=0');
    res.send(rs.rows[0].IMAGEN_BLOB);
  } catch (err) {
    console.error('❌ Error obteniendo imagen:', err);
    res.status(500).end();
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* =========================
 *  Listar productos (con estado dinámico)
 * ========================= */
exports.getProductos = async (_req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const result = await cn.execute(
      `SELECT 
          p.ID,
          p.NOMBRE,
          p.PRECIO_VENTA,
          p.IMAGEN_URL,
          p.ESTADO_ID,
          p.STOCK_MINIMO,
          p.CATEGORIA_ID,
          c.NOMBRE AS CATEGORIA_NOMBRE,
          p.UNIDAD_MEDIDA_ID,
          u.NOMBRE AS UNIDAD_NOMBRE,
          NVL(agg.STOCK_TOTAL, 0) AS STOCK_TOTAL,
          TO_CHAR(agg.PROX_VENC, 'YYYY-MM-DD') AS PROX_VENC
       FROM POS_PRODUCTO_NUEVO p
       LEFT JOIN POS_CATEGORIAPRODUCTO c ON p.CATEGORIA_ID = c.ID
       LEFT JOIN POS_UNIDAD_MEDIDA u     ON p.UNIDAD_MEDIDA_ID = u.ID
       LEFT JOIN (
         SELECT PRODUCTO_ID,
                NVL(SUM(CANTIDAD_DISPONIBLE),0) AS STOCK_TOTAL,
                MIN(FECHA_VENCIMIENTO)         AS PROX_VENC
         FROM POS_PRODUCTO_POR_LOTE
         GROUP BY PRODUCTO_ID
       ) agg ON agg.PRODUCTO_ID = p.ID
       ORDER BY p.ID DESC`,
      {},
      OUT
    );

    const productos = result.rows.map((row) => {
      const cantidad = Number(row.STOCK_TOTAL || 0);
      const stockMinimo = Number(row.STOCK_MINIMO || 0);
      const fechaVenc = row.PROX_VENC ? new Date(row.PROX_VENC) : null;
      const hoy = new Date();
      let estadoDinamico = 'Disponible';

      if (fechaVenc) {
        const diffDias = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
        if (diffDias < 0) estadoDinamico = 'Vencido';
        else if (diffDias <= 30) estadoDinamico = 'Por vencer';
      }

      if (cantidad < stockMinimo) estadoDinamico = 'Stock bajo';

      return {
        id: row.ID,
        nombre: row.NOMBRE,
        precioVenta: row.PRECIO_VENTA,
        // 👇 Fallback al endpoint correcto del POS
        imagen: row.IMAGEN_URL || buildImgURL(row.ID),
        estado: row.ESTADO_ID,
        categoria: row.CATEGORIA_ID,
        categoriaNombre: row.CATEGORIA_NOMBRE || 'Sin categoría',
        unidad: row.UNIDAD_MEDIDA_ID,
        unidadNombre: row.UNIDAD_NOMBRE || 'Sin unidad',
        cantidad,
        fechaVencimiento: row.PROX_VENC || null,
        stockMinimo,
        estadoDinamico,
      };
    });

    res.status(200).json(productos);
  } catch (error) {
    console.error('❌ Error al listar productos:', error);
    res.status(500).json({ message: 'Error al obtener productos.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* =========================
 *  Actualizar producto
 * ========================= */
exports.actualizarProducto = async (req, res) => {
  const { id } = req.params;
  let { nombre, precioVenta, categoria, unidad, estado, stockMinimo } = req.body;

  let cn;
  try {
    cn = await db.getConnection();

    const result = await cn.execute(
      `SELECT * FROM POS_PRODUCTO_NUEVO WHERE ID = :id`,
      { id },
      OUT
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Producto no encontrado.' });

    const productoActual = result.rows[0];

    if (
      typeof nombre === 'string' &&
      nombre.trim() &&
      nombre.toLowerCase() !== (productoActual.NOMBRE || '').toLowerCase()
    ) {
      const dupNombre = await cn.execute(
        `SELECT 1 FROM POS_PRODUCTO_NUEVO WHERE LOWER(NOMBRE) = :nombre AND ID != :id`,
        { nombre: nombre.toLowerCase(), id },
        OUT
      );
      if (dupNombre.rows.length > 0)
        return res.status(400).json({ message: '⚠️ Nombre de producto ya existe.' });
    }

    const ventaEnviada = precioVenta !== undefined && precioVenta !== '';
    const catEnviada = categoria !== undefined && categoria !== '';
    const umEnviada = unidad !== undefined && unidad !== '';
    const estadoEnviado = estado !== undefined && estado !== '';
    const minEnviado = stockMinimo !== undefined && stockMinimo !== '';

    let ventaNum = null;
    if (ventaEnviada) {
      ventaNum = Number(precioVenta);
      if (Number.isNaN(ventaNum) || ventaNum <= 0)
        return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0.' });
    }

    let minNum = null;
    if (minEnviado) {
      minNum = Number(stockMinimo);
      if (Number.isNaN(minNum) || minNum < 0)
        return res.status(400).json({ message: 'El stock mínimo debe ser 0 o mayor.' });
    }

    const campos = [];
    const valores = { id };

    if (nombre?.trim()) {
      campos.push('NOMBRE = :nombre');
      valores.nombre = nombre.trim();
    }
    if (catEnviada) {
      campos.push('CATEGORIA_ID = :categoria');
      valores.categoria = Number(categoria);
    }
    if (umEnviada) {
      campos.push('UNIDAD_MEDIDA_ID = :unidad');
      valores.unidad = Number(unidad);
    }
    if (ventaEnviada) {
      campos.push('PRECIO_VENTA = :precioVenta');
      valores.precioVenta = ventaNum;
    }
    if (estadoEnviado) {
      campos.push('ESTADO_ID = :estado');
      valores.estado = Number(estado);
    }
    if (minEnviado) {
      campos.push('STOCK_MINIMO = :stockMinimo');
      valores.stockMinimo = minNum;
    }

    if (req.file) {
      campos.push('IMAGEN_BLOB = :imgBlob');
      campos.push('IMAGEN_MIME = :imgMime');
      campos.push('IMAGEN_NOMBRE = :imgName');
      campos.push('IMAGEN_URL = :imgUrl');

      valores.imgBlob = req.file.buffer;
      valores.imgMime = req.file.mimetype || 'application/octet-stream';
      valores.imgName = clean(req.file.originalname || `img_${Date.now()}`);
      valores.imgUrl = buildImgURL(id);
    }

    if (campos.length === 0)
      return res.status(400).json({ message: 'No se enviaron campos para actualizar.' });

    const query = `
      UPDATE POS_PRODUCTO_NUEVO
         SET ${campos.join(', ')}
       WHERE ID = :id
    `;
    await cn.execute(query, valores, { autoCommit: true });

    // Recalcular estado defensivo
    try {
      await cn.execute(`BEGIN RECALC_PRODUCTO_ESTADO(:pid); END;`, { pid: id }, { autoCommit: true });
    } catch (e) {
      console.warn('⚠️ RECALC_PRODUCTO_ESTADO falló:', e?.message);
    }

    const actualizado = await cn.execute(
      `SELECT 
         p.ID as id,
         p.NOMBRE as nombre,
         p.PRECIO_VENTA as precioVenta,
         p.CATEGORIA_ID as categoria,
         c.NOMBRE as categoriaNombre,
         p.UNIDAD_MEDIDA_ID as unidad,
         u.NOMBRE as unidadNombre,
         p.ESTADO_ID as estado,
         e.NOMBRE as estadoNombre,
         p.STOCK_MINIMO as stockMinimo,
         p.IMAGEN_URL as imagen
       FROM POS_PRODUCTO_NUEVO p
       LEFT JOIN POS_CATEGORIAPRODUCTO c ON p.CATEGORIA_ID = c.ID
       LEFT JOIN POS_UNIDAD_MEDIDA u ON p.UNIDAD_MEDIDA_ID = u.ID
       LEFT JOIN POS_ESTADOS_USUARIOS e ON p.ESTADO_ID = e.ID
       WHERE p.ID = :id`,
      { id },
      OUT
    );

    res.status(200).json(actualizado.rows[0]);
  } catch (error) {
    console.error('❌ Error al actualizar producto:', error);
    res.status(500).json({ message: 'Error al actualizar producto.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* =========================
 *  Eliminar producto
 * ========================= */
exports.eliminarProducto = async (req, res) => {
  const { id } = req.params;
  let cn;

  try {
    cn = await db.getConnection();

    const prodRs = await cn.execute(`SELECT ID FROM POS_PRODUCTO_NUEVO WHERE ID = :id`, { id }, OUT);
    if (prodRs.rows.length === 0)
      return res.status(404).json({ message: 'Producto no encontrado.' });

    const [ventaCabRs, ventaLoteRs] = await Promise.all([
      cn.execute(`SELECT COUNT(*) AS TOTAL FROM POS_DETALLE_VENTA WHERE PRODUCTO_ID = :id`, { id }, OUT),
      cn.execute(`SELECT COUNT(*) AS TOTAL FROM POS_DETALLE_VENTA_LOTE WHERE PRODUCTO_ID = :id`, { id }, OUT),
    ]);

    const enVentas = Number(ventaCabRs.rows[0].TOTAL || 0) + Number(ventaLoteRs.rows[0].TOTAL || 0);
    if (enVentas > 0)
      return res
        .status(409)
        .json({ message: 'No se puede eliminar: el producto está asociado a ventas.' });

    const comboRs = await cn.execute(
      `SELECT COUNT(*) AS TOTAL FROM POS_DETALLE_COMBO WHERE PRODUCTO_ID = :id`,
      { id },
      OUT
    );
    const enCombos = Number(comboRs.rows[0].TOTAL || 0);
    if (enCombos > 0)
      return res
        .status(409)
        .json({ message: 'No se puede eliminar: el producto forma parte de uno o más combos.' });

    await cn.execute(`DELETE FROM POS_PRODUCTO_POR_LOTE WHERE PRODUCTO_ID = :id`, { id }, { autoCommit: false });
    const del = await cn.execute(`DELETE FROM POS_PRODUCTO_NUEVO WHERE ID = :id`, { id }, { autoCommit: false });

    if ((del.rowsAffected || 0) === 0) {
      await cn.rollback();
      return res.status(404).json({ message: 'Producto no encontrado.' });
    }

    await cn.commit();
    res.status(200).json({ message: 'Producto eliminado correctamente.' });
  } catch (error) {
    if (cn) try { await cn.rollback(); } catch {}
    if (error && error.errorNum === 2292) {
      return res.status(409).json({
        message:
          'No se puede eliminar: el producto tiene registros dependientes (ventas, combos o lotes).',
      });
    }
    console.error('❌ Error al eliminar producto:', error);
    res.status(500).json({ message: 'Error al eliminar producto.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
