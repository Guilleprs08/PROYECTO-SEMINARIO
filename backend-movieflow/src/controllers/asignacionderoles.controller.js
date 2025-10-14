// src/controllers/asignacionderoles.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');

/**
 * Registra un nuevo rol si no está duplicado.
 */
exports.crearRol = async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || typeof nombre !== 'string') {
    return res.status(400).json({ message: 'Nombre de rol inválido' });
  }

  const nombreLimpio = nombre.trim();

  let connection;

  try {
    connection = await db.getConnection();

    // Verificar duplicado
    const result = await connection.execute(
      `SELECT COUNT(*) AS cantidad FROM roles WHERE LOWER(nombre) = LOWER(:nombre)`,
      [nombreLimpio],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows[0].CANTIDAD > 0) {
      return res.status(409).json({ message: 'El rol ya existe' });
    }

    // Insertar nuevo rol
    await connection.execute(
      `INSERT INTO roles (nombre) VALUES (:nombre)`,
      [nombreLimpio],
      { autoCommit: true }
    );

    return res.status(201).json({ message: 'Rol registrado correctamente' });
  } catch (error) {
    console.error('Error al registrar rol:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar conexión:', err);
      }
    }
  }
};
