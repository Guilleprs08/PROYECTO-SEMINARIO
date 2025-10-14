// controllers/calculoproducto.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');

exports.getCalculosProductos = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    // 📌 Consulta con PRODUCTO_ESTADO para reflejar exactamente lo que calcula el trigger
    const result = await connection.execute(
      `
      SELECT 
          -- Total de productos
          COUNT(DISTINCT p.id) AS TOTAL_PRODUCTOS,

          -- Stock total
          NVL(SUM(p.cantidad), 0) AS STOCK_TOTAL,

          -- Productos con estado STOCK_BAJO según trigger
          COUNT(DISTINCT CASE WHEN pe.estado = 'STOCK_BAJO' THEN p.id END) AS PRODUCTOS_STOCK_BAJO,

          -- Costo total
          NVL(SUM(p.cantidad * p.precio_costo), 0) AS COSTO_TOTAL
      FROM producto_nuevo p
      LEFT JOIN producto_estado pe
          ON p.id = pe.producto_id
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows[0];

    res.json({
      total_productos: row.TOTAL_PRODUCTOS,
      stock_total: row.STOCK_TOTAL,
      productos_stock_bajo: row.PRODUCTOS_STOCK_BAJO,
      costo_total: row.COSTO_TOTAL
    });

  } catch (error) {
    console.error("Error calculando productos:", error);
    res.status(500).json({ message: "Error al obtener cálculos de productos" });
  } finally {
    if (connection) await connection.close();
  }
};
