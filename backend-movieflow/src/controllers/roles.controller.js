const db = require('../config/db');
const oracledb = require('oracledb');

exports.getRoles = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT ID, NOMBRE FROM roles WHERE ID != 8`, // Excluir el rol "cliente"
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) await connection.close();
  }
};
