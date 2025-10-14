const db = require("../../config/db");
const oracledb = require("oracledb");

// 🔹 Obtener todas las cajas
exports.listarCajas = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT id_caja AS id, nombre_caja AS nombre
       FROM pos_cajas
       ORDER BY id_caja`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error al obtener cajas:", error);
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

// 🔹 Obtener todos los turnos
exports.listarTurnos = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT id_turno AS id, nombre_turno AS nombre
       FROM pos_turnos
       ORDER BY id_turno`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error al obtener turnos:", error);
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
