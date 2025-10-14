const db = require('../config/db');
const bcrypt = require('bcrypt');
const oracledb = require('oracledb');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  let connection;

  try {
    const cleanUsername = username.trim();
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
         id AS "ID",                            -- ✅ AÑADIDO
         usuario AS "usuario", 
         password_hash AS "password_hash", 
         estado AS "estado", 
         role_id AS "role_id" 
       FROM usuarios 
       WHERE usuario = :usuario`,
      [cleanUsername],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    if (user.estado !== 1) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    await connection.execute(
      `UPDATE usuarios 
       SET ultimo_login = SYSTIMESTAMP 
       WHERE usuario = :usuario`,
      [cleanUsername],
      { autoCommit: true }
    );

    return res.json({
      message: 'Inicio de sesión exitoso',
      id: user.ID,             // ✅ AHORA SÍ SE INCLUYE
      role_id: user.role_id
    });

  } catch (error) {
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
};
