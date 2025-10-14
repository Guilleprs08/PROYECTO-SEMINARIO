// controllers/ventas/estadoVenta.controller.js
const db = require("../../config/db");
const oracledb = require("oracledb");

exports.listarEstadosVenta = async (req, res) => {
  let connection;

  try {
    connection = await db.getConnection();

    const query = `
      SELECT id_estado, nombre
      FROM pos_estado_venta
      ORDER BY nombre
    `;

    const result = await connection.execute(query, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const estados = result.rows.map((row) => ({
      id: row.ID_ESTADO,
      nombre: row.NOMBRE,
    }));

    res.json(estados);
  } catch (error) {
    console.error("❌ Error en listarEstadosVenta:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("❌ Error cerrando conexión:", err);
      }
    }
  }
};
