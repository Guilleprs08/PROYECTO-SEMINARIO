const db = require("../config/db");
const oracledb = require("oracledb");
const xss = require("xss");

// 📌 Actualizar producto (dinámico)
exports.actualizarProducto = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    let updates = [];
    let params = { id };

    connection = await db.getConnection();

    // ✅ Sanitizar y agregar dinámicamente campos enviados
    if (req.body.nombre !== undefined) {
      updates.push("NOMBRE = :nombre");
      params.nombre = xss(req.body.nombre.trim());
    }

    if (req.body.categoria_id !== undefined) {
      updates.push("CATEGORIA_ID = :categoria_id");
      params.categoria_id = req.body.categoria_id;
    }

    if (req.body.unidad_medida_id !== undefined) {
      updates.push("UNIDAD_MEDIDA_ID = :unidad_medida_id");
      params.unidad_medida_id = req.body.unidad_medida_id;
    }

    // ✅ Normalizar fecha antes de enviar a Oracle
    if (req.body.fecha_vencimiento !== undefined) {
      let fechaFormateada = null;
      const fv = req.body.fecha_vencimiento;

      if (/^\d{2}\/\d{2}\/\d{4}$/.test(fv)) {
        const [dia, mes, anio] = fv.split("/");
        fechaFormateada = `${anio}-${mes}-${dia}`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fv)) {
        fechaFormateada = fv;
      } else {
        const fecha = new Date(fv);
        if (!isNaN(fecha)) {
          fechaFormateada = fecha.toISOString().split("T")[0];
        }
      }

      if (fechaFormateada) {
        updates.push("FECHA_VENCIMIENTO = TO_DATE(:fecha_vencimiento, 'YYYY-MM-DD')");
        params.fecha_vencimiento = fechaFormateada;
      }
    }

    if (req.body.cantidad !== undefined) {
      updates.push("CANTIDAD = :cantidad");
      params.cantidad = req.body.cantidad;
    }

    if (req.body.precio_venta !== undefined) {
      updates.push("PRECIO_VENTA = :precio_venta");
      params.precio_venta = req.body.precio_venta;
    }

    if (req.body.precio_costo !== undefined) {
      updates.push("PRECIO_COSTO = :precio_costo");
      params.precio_costo = req.body.precio_costo;
    }

    // ✅ Manejar estado (activo = 1, inactivo = 0)
    if (req.body.estado_id !== undefined) {
      updates.push("ESTADO_ID = :estado_id");
      params.estado_id = req.body.estado_id;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No se enviaron campos para actualizar" });
    }

    // Verificar que el producto exista
    const check = await connection.execute(
      `SELECT ID FROM POS_PRODUCTO_NUEVO WHERE ID = :id`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    // Ejecutar actualización dinámica
    const sql = `UPDATE POS_PRODUCTO_NUEVO SET ${updates.join(", ")} WHERE ID = :id`;
    await connection.execute(sql, params, { autoCommit: true });

    res.json({ message: "Producto actualizado correctamente" });
  } catch (err) {
    console.error("Error actualizando producto:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};

exports.eliminarProducto = async (req, res) => {
  let connection;
  try {
    const idNum = Number(req.params.id);

    // ✅ Validar ID numérico
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ message: "ID inválido, debe ser numérico" });
    }

    connection = await db.getConnection();

    // ✅ Verificar existencia
    const check = await connection.execute(
      `SELECT ID FROM POS_PRODUCTO_NUEVO WHERE ID = :id`,
      { id: idNum },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    // ✅ Eliminar
    await connection.execute(
      `DELETE FROM POS_PRODUCTO_NUEVO WHERE ID = :id`,
      { id: idNum },
      { autoCommit: true }
    );

    res.json({ message: "Producto eliminado correctamente" });
  } catch (err) {
    console.error("Error eliminando producto:", err);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
