const db = require('../config/db');
const oracledb = require('oracledb');

exports.getEstados = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT ID, NOMBRE FROM estados_usuario`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) await connection.close();
  }
};
