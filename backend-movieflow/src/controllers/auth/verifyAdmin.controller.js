// backend/controllers/auth/verifyAdmin.controller.js
const db = require('../../config/db');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const xss = require('xss');

// 🔐 Ajusta estos IDs/nombres según tu BD:
const ADMIN_ROLE_IDS = new Set([1]); // ← pon aquí el/los ID(s) reales del rol admin
const ADMIN_ROLE_NAMES = new Set(['admin', 'administrador', 'superadmin']);

exports.verifyAdmin = async (req, res) => {
  let { username, password } = req.body;
  let connection;

  try {
    // Sanitizar + validar
    username = xss(username?.trim() || '');
    password = password?.trim() || '';
    if (!username || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
    }

    connection = await db.getConnection();

    // SELECT con alias en minúsculas
    const query = `
      SELECT
        u.id             AS "id",
        u.usuario        AS "usuario",
        u.password_hash  AS "password_hash",
        u.estado         AS "estado",
        u.role_id        AS "role_id",
        r.nombre         AS "rol"
      FROM   usuarios u
      JOIN   roles r ON r.id = u.role_id
      WHERE  UPPER(u.usuario) = UPPER(:username)
      FETCH FIRST 1 ROWS ONLY
    `;

    const result = await connection.execute(
      query,
      { username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    // Estado activo
    const estadoNum = Number(user.estado);
    if (!Number.isFinite(estadoNum) || estadoNum !== 1) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    // Contraseña
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // ✅ Verificación de privilegios por role_id (preferida) o por nombre (respaldo)
    const roleId = Number(user.role_id);
    const rolNombre = String(user.rol || '').trim().toLowerCase();
    const esAdminPorId = Number.isFinite(roleId) && ADMIN_ROLE_IDS.has(roleId);
    const esAdminPorNombre = ADMIN_ROLE_NAMES.has(rolNombre);

    if (!esAdminPorId && !esAdminPorNombre) {
      return res.status(403).json({ message: 'No tiene privilegios de administrador' });
    }

    // Respuesta segura
    return res.json({
      ok: true,
      admin: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        role_id: roleId
      },
    });
  } catch (err) {
    console.error('❌ Error en verifyAdmin:', err);
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
};
