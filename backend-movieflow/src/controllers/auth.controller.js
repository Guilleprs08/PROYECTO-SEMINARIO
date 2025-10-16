// controllers/auth.controller.js
const db = require('../config/db');
const bcrypt = require('bcrypt');
const oracledb = require('oracledb');

/* ===========================
 * Helper: política de password
 * =========================== */
const validarPoliticaPassword = (pwd = "") => {
  const errores = [];
  if (typeof pwd !== "string" || pwd.length < 8) errores.push("La contraseña debe tener al menos 8 caracteres.");
  if (!/[A-Z]/.test(pwd)) errores.push("Debe incluir al menos una letra mayúscula.");
  if (!/[a-z]/.test(pwd)) errores.push("Debe incluir al menos una letra minúscula.");
  if (!/[0-9]/.test(pwd)) errores.push("Debe incluir al menos un número.");
  if (!/[!@#$%^&*]/.test(pwd)) errores.push("Debe incluir al menos un carácter especial (!@#$%^&*).");
  return { esValida: errores.length === 0, errores };
};

/* ===========================================
 * LOGIN
 * - Acepta { usuario } o { username }
 * - Búsqueda case-insensitive por usuario
 * - Actualiza ultimo_login por ID
 * - Devuelve es_primer_login (flag o ultimo_login IS NULL)
 * =========================================== */
exports.login = async (req, res) => {
  const { username, usuario, password } = req.body || {};
  let connection;

  try {
    const loginId = String((usuario ?? username ?? '')).trim();
    if (!loginId || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
    }

    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
         u.id               AS "ID",
         u.usuario          AS "USUARIO",
         u.password_hash    AS "PASSWORD_HASH",
         u.estado           AS "ESTADO",
         u.role_id          AS "ROLE_ID",
         r.nombre           AS "ROL_NOMBRE",
         u.es_primer_login  AS "ES_PRIMER_LOGIN",
         u.ultimo_login     AS "ULTIMO_LOGIN"
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE TRIM(UPPER(u.usuario)) = TRIM(UPPER(:usuario))`,
      { usuario: loginId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Estado activo (1 o 'ACTIVO')
    const estadoEsActivo =
      String(user.ESTADO).toUpperCase() === 'ACTIVO' || Number(user.ESTADO) === 1;
    if (!estadoEsActivo) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    const esPrimerLogin =
      (Number(user.ES_PRIMER_LOGIN) === 1) || (user.ULTIMO_LOGIN == null);

    await connection.execute(
      `UPDATE usuarios SET ultimo_login = SYSTIMESTAMP WHERE id = :id`,
      { id: user.ID },
      { autoCommit: true }
    );

    return res.json({
      message: 'Inicio de sesión exitoso',
      id: user.ID,
      role_id: user.ROLE_ID,
      rol_nombre: user.ROL_NOMBRE || null,
      es_primer_login: esPrimerLogin
    });

  } catch (error) {
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};

/* =========================================================
 * CAMBIO DE CONTRASEÑA EN PRIMER LOGIN
 * - Verifica actual
 * - Política
 * - No repetir últimas 5
 * - Inserta historial
 * - Actualiza hash y apaga es_primer_login
 * ========================================================= */
exports.cambiarPasswordPrimerLogin = async (req, res) => {
  const { usuarioId, actualPassword, nuevaPassword } = req.body || {};
  let connection;

  if (!Number.isFinite(Number(usuarioId))) {
    return res.status(400).json({ message: "usuarioId inválido." });
  }

  const pol = validarPoliticaPassword(nuevaPassword);
  if (!pol.esValida) {
    return res.status(400).json({ message: "Contraseña inválida", errores: pol.errores });
  }

  try {
    connection = await db.getConnection();

    // 1) Usuario
    const qUser = await connection.execute(
      `SELECT id AS "ID", password_hash AS "PASSWORD_HASH", es_primer_login AS "ES_PRIMER_LOGIN"
         FROM usuarios
        WHERE id = :p_id`,
      { p_id: Number(usuarioId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (qUser.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const user = qUser.rows[0];

    // 2) Verificar actual
    const okActual = await bcrypt.compare(actualPassword, user.PASSWORD_HASH);
    if (!okActual) {
      return res.status(401).json({ message: "La contraseña actual no es correcta." });
    }

    // 3) No igual a actual
    const igualActual = await bcrypt.compare(nuevaPassword, user.PASSWORD_HASH);
    if (igualActual) {
      return res.status(400).json({ message: "La nueva contraseña no puede ser igual a la actual." });
    }

    // 4) Últimas 5 del historial
    const qHist = await connection.execute(
      `SELECT password_hash AS "PASSWORD_HASH"
         FROM usuario_password_hist
        WHERE usuario_id = :p_id
        ORDER BY fecha_cambio DESC
        FETCH FIRST 5 ROWS ONLY`,
      { p_id: Number(usuarioId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    for (const row of qHist.rows) {
      const coincide = await bcrypt.compare(nuevaPassword, row.PASSWORD_HASH);
      if (coincide) {
        return res.status(400).json({
          message: "La nueva contraseña coincide con una de las últimas 5. Elige una diferente."
        });
      }
    }

    // 5) Hash nuevo
    const nuevoHash = await bcrypt.hash(nuevaPassword, 10);

    // 6) Guardar la contraseña anterior en historial
    await connection.execute(
      `INSERT INTO usuario_password_hist (usuario_id, password_hash, origen, cambiado_por)
       VALUES (:p_uid, :p_pwd, :p_origen, :p_cambiado_por)`,
      {
        p_uid: user.ID,
        p_pwd: user.PASSWORD_HASH,
        p_origen: Number(user.ES_PRIMER_LOGIN) === 1 ? "PRIMER_LOGIN" : "USUARIO",
        p_cambiado_por: user.ID
      }
    );

    // 7) Actualizar usuario
    await connection.execute(
      `UPDATE usuarios
          SET password_hash = :p_nuevo_hash,
              es_primer_login = 0
        WHERE id = :p_id`,
      { p_nuevo_hash: nuevoHash, p_id: user.ID }
    );

    await connection.commit();
    return res.json({ message: "Contraseña cambiada correctamente." });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch {} }
    return res.status(500).json({ message: err?.message || "No se pudo cambiar la contraseña." });
  } finally {
    if (connection) { try { await connection.close(); } catch {} }
  }
};
