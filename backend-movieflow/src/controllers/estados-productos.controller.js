const db = require('../config/db');
const oracledb = require('oracledb');

exports.listarEstadosProductos = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT ID, NOMBRE 
       FROM POS_ESTADOS_USUARIOS  -- 👈 si tu tabla real es otra, cámbiala aquí
       ORDER BY ID ASC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar estados de productos:', error);
    res.status(500).json({ message: 'Error al obtener los estados de productos.' });
  } finally {
    if (connection) await connection.close();
  }
};
