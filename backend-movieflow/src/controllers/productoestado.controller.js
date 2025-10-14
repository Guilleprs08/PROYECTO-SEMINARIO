// productoestado.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');

// 🔹 Devuelve todos los estados únicos del sistema (como catálogo)
exports.listarEstadosProducto = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT DISTINCT ESTADO
       FROM POS_PRODUCTO_ESTADO
       ORDER BY ESTADO`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Devuelve un array con los nombres de estados
    const estados = result.rows.map(row => row.ESTADO);

    res.json(estados);
  } catch (error) {
    console.error('❌ Error obteniendo estados de producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) await connection.close();
  }
};

// 🔹 Devuelve solo los estados dinámicos de un producto específico
exports.listarEstadosPorProducto = async (req, res) => {
  const { id } = req.params; // ID del producto
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT ESTADO
       FROM POS_PRODUCTO_ESTADO
       WHERE PRODUCTO_ID = :id
       ORDER BY FECHA_REGISTRO DESC`,
      [id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // Extraemos solo los nombres de los estados
    const estados = result.rows.map(row => row.ESTADO);

    res.json(estados);
  } catch (error) {
    console.error('❌ Error obteniendo estados del producto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) await connection.close();
  }
};

// productoestado.controller.js
exports.listarProductosPorEstado = async (req, res) => {
  let connection;
  const { estado } = req.params; // ej: 'STOCK_BAJO'

  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT p.ID,
              p.CODIGO_BARRAS,
              p.NOMBRE,
              p.CANTIDAD,
              p.PRECIO_COSTO,
              p.PRECIO_VENTA,
              TO_CHAR(p.FECHA_VENCIMIENTO, 'YYYY-MM-DD') AS FECHA_VENCIMIENTO,
              p.IMAGEN,
              p.ESTADO_ID,
              pe.ESTADO
       FROM POS_PRODUCTO_NUEVO p
       JOIN POS_PRODUCTO_ESTADO pe ON pe.PRODUCTO_ID = p.ID
       WHERE pe.ESTADO = :estado
       ORDER BY p.ID DESC`,
      { estado: estado.toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error filtrando productos por estado:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
