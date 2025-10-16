// backend/controllers/auth/verifyAdmin.controller.js
const db = require('../../config/db');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const xss = require('xss');

// 🔐 Ajusta estos IDs/nombres según tu BD si lo deseas.
// Si no quieres depender de IDs, con los nombres basta.
const ADMIN_ROLE_IDS   = new Set([1]);
const ADMIN_ROLE_NAMES = new Set(['admin', 'administrador', 'superadmin']);

function esAdmin(roleId, rolNombre) {
  const byId   = Number.isFinite(Number(roleId)) && ADMIN_ROLE_IDS.has(Number(roleId));
  const byName = ADMIN_ROLE_NAMES.has(String(rolNombre || '').trim().toLowerCase());
  return byId || byName;
}

exports.verifyAdmin = async (req, res) => {
  let { user_id, username, password } = req.body || {};
  let connection;

  try {
    connection = await db.getConnection();

    /* ==========================================================
     *  MODO A: Verificar por ID (sin contraseña)
     *  - Front manda { user_id }
     *  - Se valida en BD: USUARIOS.ESTADO = 1 y rol admin
     * ========================================================== */
    if (user_id !== undefined && user_id !== null && `${user_id}`.trim() !== '') {
      const id = Number(user_id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: 'user_id inválido' });
      }

      const qById = `
        SELECT
          u.id             AS "id",
          u.usuario        AS "usuario",
          u.estado         AS "estado",
          u.role_id        AS "role_id",
          u.es_primer_login AS "es_primer_login",
          r.nombre         AS "rol"
        FROM   usuarios u
        JOIN   roles r ON r.id = u.role_id
        WHERE  u.id = :id
        FETCH FIRST 1 ROWS ONLY
      `;
      const r = await connection.execute(qById, { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      if (!r.rows || r.rows.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      const u = r.rows[0];

      // Estado ACTIVO
      if (Number(u.estado) !== 1) {
        return res.status(403).json({ message: 'Usuario inactivo' });
      }

      // Rol admin por ID o por nombre
      if (!esAdmin(u.role_id, u.rol)) {
        return res.status(403).json({ message: 'No tiene privilegios de administrador' });
      }

      // OK por ID (sin password)
      return res.json({
        ok: true,
        admin: {
          id: u.id,
          usuario: u.usuario,
          rol: u.rol,
          role_id: Number(u.role_id),
          es_primer_login: Number(u.es_primer_login) === 1,
          via: 'by_id',
        },
      });
    }

    /* ==========================================================
     *  MODO B: Verificar por usuario + contraseña
     *  - Front manda { username, password }
     * ========================================================== */
    username = xss(String(username ?? '').trim());
    password = String(password ?? '').trim();

    if (!username || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
    }

    const qByUser = `
      SELECT
        u.id             AS "id",
        u.usuario        AS "usuario",
        u.password_hash  AS "password_hash",
        u.estado         AS "estado",
        u.role_id        AS "role_id",
        u.es_primer_login AS "es_primer_login",
        r.nombre         AS "rol"
      FROM   usuarios u
      JOIN   roles r ON r.id = u.role_id
      WHERE  UPPER(u.usuario) = UPPER(:username)
      FETCH FIRST 1 ROWS ONLY
    `;
    const rUser = await connection.execute(
      qByUser,
      { username },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!rUser.rows || rUser.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const user = rUser.rows[0];

    // Estado ACTIVO
    if (Number(user.estado) !== 1) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    // Contraseña
    const okPass = await bcrypt.compare(password, user.password_hash);
    if (!okPass) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // Rol admin
    if (!esAdmin(user.role_id, user.rol)) {
      return res.status(403).json({ message: 'No tiene privilegios de administrador' });
    }

    // OK por credenciales
    return res.json({
      ok: true,
      admin: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        role_id: Number(user.role_id),
        es_primer_login: Number(user.es_primer_login) === 1,
        via: 'credentials',
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
