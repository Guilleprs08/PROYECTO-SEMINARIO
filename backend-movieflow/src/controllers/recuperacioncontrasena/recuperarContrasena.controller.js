// src/controllers/recuperacioncontrasena/recuperarContrasena.controller.js 
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const sgMail = require('@sendgrid/mail');
const db = require('../../config/db');

/* =========================
 * Configuración y helpers
 * ========================= */
sgMail.setApiKey(process.env.SENDGRID_API_KEY_MOVIEFLOW || process.env.SENDGRID_API_KEY_RECUP || '');

// ✅ Remitente con nombre visible
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM || '';
const FROM_NAME  = process.env.SENDGRID_FROM_NAME  || 'Sistema MovieFlow';
const REPLY_TO   = process.env.SENDGRID_REPLY_TO   || '';

const TTL_SECONDS   = Number(process.env.RECUP_CODE_TTL_SECONDS || 60);
const MAX_REENVIOS  = Number(process.env.RECUP_MAX_REENVIOS || 5);

// 🔔 Por defecto TRUE para mostrar alertas claras (404/403).
// En producción pública, puedes ponerlo en false para evitar enumeración.
const ENUMERATE = String(process.env.RECUP_ALLOW_ENUMERATION ?? 'true').toLowerCase() === 'true';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const USER_RE  = /^[a-z0-9._-]{3,30}$/i;

function validarIdentificador(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, msg: 'Ingresa tu usuario o correo.' };
  const id = raw.trim().toLowerCase();
  if (!id || id.length > 100) return { ok: false, msg: 'Identificador inválido.' };
  if (id.includes('@')) {
    if (!EMAIL_RE.test(id)) return { ok: false, msg: 'Formato de correo inválido.' };
  } else {
    if (!USER_RE.test(id)) return { ok: false, msg: 'Usuario inválido (3-30, letras/números . _ -).' };
  }
  return { ok: true, id };
}
function validarCodigo(code) {
  return typeof code === 'string' && /^[0-9]{6}$/.test(code);
}
function validarPassword(pwd) {
  const errs = [];
  if (typeof pwd !== 'string' || pwd.length < 8) errs.push('Debe tener al menos 8 caracteres.');
  if (!/[A-Z]/.test(pwd)) errs.push('Debe incluir al menos una mayúscula.');
  if (!/[a-z]/.test(pwd)) errs.push('Debe incluir al menos una minúscula.');
  if (!/[0-9]/.test(pwd)) errs.push('Debe incluir al menos un número.');
  if (!/[!@#$%^&*]/.test(pwd)) errs.push('Debe incluir al menos un carácter especial (!@#$%^&*).');
  return { ok: errs.length === 0, errores: errs };
}
function generarCodigo6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function correoHabilitado() {
  return Boolean(
    sgMail &&
    (process.env.SENDGRID_API_KEY_MOVIEFLOW || process.env.SENDGRID_API_KEY_RECUP) &&
    FROM_EMAIL
  );
}
function esCuentaActiva(estado) {
  // Soporta 1/0 o 'ACTIVO'/'INACTIVO'
  if (estado === 1 || estado === '1') return true;
  if (typeof estado === 'string') return estado.toUpperCase() === 'ACTIVO';
  return false;
}

/* ---------- helper: leer usuario por identificador (email o usuario) ---------- */
async function getUsuarioPorIdentificador(cn, identificador) {
  const byEmail = identificador.includes('@');
  const sql = byEmail
    ? `SELECT ID, CORREO AS EMAIL, PASSWORD_HASH, ESTADO FROM USUARIOS
         WHERE LOWER(CORREO) = :p_v
         FETCH FIRST 1 ROWS ONLY`
    : `SELECT ID, CORREO AS EMAIL, PASSWORD_HASH, ESTADO FROM USUARIOS
         WHERE LOWER(USUARIO) = :p_v
         FETCH FIRST 1 ROWS ONLY`;

  const r = await cn.execute(sql, { p_v: identificador }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return r.rows[0] || null;
}

/* ===============================
 * 1) /password/forgot
 * =============================== */
exports.recuperarContrasena = async (req, res) => {
  const v = validarIdentificador(req.body.identificador);
  if (!v.ok) return res.status(400).json({ message: v.msg });
  const identificador = v.id;

  let cn;
  try {
    cn = await db.getConnection();

    const user = await getUsuarioPorIdentificador(cn, identificador);

    // 🚫 Usuario/correo no existe
    if (!user) {
      if (ENUMERATE) return res.status(404).json({ message: 'Usuario o correo no existen.' });
      return res.json({ message: 'Si el identificador es válido, se envió un código de recuperación.', ttl: TTL_SECONDS });
    }

    // 🚫 Cuenta inactiva
    if (!esCuentaActiva(user.ESTADO)) {
      if (ENUMERATE) return res.status(403).json({ message: 'La cuenta está inactiva. Contacta al administrador.' });
      return res.json({ message: 'Si el identificador es válido, se envió un código de recuperación.', ttl: TTL_SECONDS });
    }

    // Expirar flujos activos previos
    await cn.execute(
      `UPDATE RECUPERACION_PWD
          SET ESTADO = 'EXPIRADO'
        WHERE USUARIO_ID = :p_uid
          AND ESTADO = 'ACTIVO'`,
      { p_uid: user.ID }
    );

    // Generar y guardar código
    const code = generarCodigo6();
    const codeHash = await bcrypt.hash(code, 10);

    await cn.execute(
      `INSERT INTO RECUPERACION_PWD
         (USUARIO_ID, CODE_HASH, EXPIRA_EN, USADO_EN, ESTADO, REENVIOS)
       VALUES
         (:p_uid, :p_code_hash,
          SYSTIMESTAMP + NUMTODSINTERVAL(:p_ttl_seconds,'SECOND'),
          NULL, 'ACTIVO', 0)`,
      { p_uid: user.ID, p_code_hash: codeHash, p_ttl_seconds: TTL_SECONDS }
    );

    await cn.commit();

    if (correoHabilitado()) {
      try {
        await sgMail.send({
          to: user.EMAIL,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          replyTo: REPLY_TO || undefined,
          subject: 'Código de recuperación de contraseña',
          text: `Tu código es: ${code}. Expira en ${TTL_SECONDS} segundos.`,
          html: `
            <p>Tu código de verificación es:</p>
            <p style="font-size:22px;margin:8px 0"><strong>${code}</strong></p>
            <p>Expira en <strong>${TTL_SECONDS} segundos</strong>.</p>
          `,
        });
      } catch (mailErr) {
        console.error('SendGrid (forgot):', mailErr?.response?.body || mailErr);
        // No detenemos el flujo por fallo de correo
      }
    } else {
      console.warn('Recuperación: SendGrid/FROM no configurados.');
    }

    return res.json({ message: 'Código enviado a tu correo registrado.', ttl: TTL_SECONDS });
  } catch (err) {
    console.error('Error /password/forgot:', err);
    try { await cn?.rollback(); } catch {}
    return res.status(500).json({ message: 'Error interno.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* ===============================
 * 2) /password/resend
 * =============================== */
exports.reenviarCodigo = async (req, res) => {
  const v = validarIdentificador(req.body.identificador);
  if (!v.ok) return res.status(400).json({ message: v.msg });
  const identificador = v.id;

  let cn;
  try {
    cn = await db.getConnection();

    const user = await getUsuarioPorIdentificador(cn, identificador);

    // 🚫 Usuario/correo no existe
    if (!user) {
      if (ENUMERATE) return res.status(404).json({ message: 'Usuario o correo no existen.' });
      return res.json({ message: 'Si existe un flujo activo, se envió un nuevo código.', ttl: TTL_SECONDS });
    }

    // 🚫 Cuenta inactiva
    if (!esCuentaActiva(user.ESTADO)) {
      if (ENUMERATE) return res.status(403).json({ message: 'La cuenta está inactiva. Contacta al administrador.' });
      return res.json({ message: 'Si existe un flujo activo, se envió un nuevo código.', ttl: TTL_SECONDS });
    }

    // Buscar flujo activo más reciente
    const fr = await cn.execute(
      `SELECT ID, NVL(REENVIOS,0) AS REENVIOS
         FROM RECUPERACION_PWD
        WHERE USUARIO_ID = :p_uid AND ESTADO = 'ACTIVO'
        ORDER BY CREADO_EN DESC
        FETCH FIRST 1 ROWS ONLY`,
      { p_uid: user.ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const flow = fr.rows[0];

    if (!flow) {
      // No hay flujo activo
      return res.status(400).json({ message: 'No hay un código activo para reenviar. Solicita uno nuevo.' });
    }

    if (Number(flow.REENVIOS) >= MAX_REENVIOS) {
      return res.status(429).json({ message: 'Has alcanzado el límite de reenvíos. Intenta más tarde.' });
    }

    const code = generarCodigo6();
    const codeHash = await bcrypt.hash(code, 10);

    await cn.execute(
      `UPDATE RECUPERACION_PWD
          SET CODE_HASH = :p_code_hash,
              EXPIRA_EN = SYSTIMESTAMP + NUMTODSINTERVAL(:p_ttl_seconds,'SECOND'),
              CREADO_EN = SYSTIMESTAMP,
              REENVIOS  = NVL(REENVIOS,0) + 1
        WHERE ID = :p_id`,
      { p_code_hash: codeHash, p_ttl_seconds: TTL_SECONDS, p_id: flow.ID }
    );

    await cn.commit();

    if (correoHabilitado()) {
      try {
        await sgMail.send({
          to: user.EMAIL,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          replyTo: REPLY_TO || undefined,
          subject: 'Nuevo código de recuperación',
          text: `Tu nuevo código es: ${code}. Expira en ${TTL_SECONDS} segundos.`,
          html: `<p>Tu nuevo código es: <strong>${code}</strong></p><p>Expira en <strong>${TTL_SECONDS}s</strong>.</p>`,
        });
      } catch (mailErr) {
        console.error('SendGrid (resend):', mailErr?.response?.body || mailErr);
      }
    } else {
      console.warn('Reenvío: SendGrid/FROM no configurados.');
    }

    return res.json({ message: 'Nuevo código enviado a tu correo registrado.', ttl: TTL_SECONDS });
  } catch (err) {
    console.error('Error /password/resend:', err);
    try { await cn?.rollback(); } catch {}
    return res.status(500).json({ message: 'Error interno.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};

/* ===============================
 * 3) /password/reset
 * =============================== */
exports.resetContrasena = async (req, res) => {
  const v = validarIdentificador(req.body.identificador);
  if (!v.ok) return res.status(400).json({ message: v.msg });
  const identificador = v.id;

  const code   = (req.body.code || '').trim();
  const newPwd = (req.body.newPassword || req.body.nuevaPassword || '').trim();

  if (!validarCodigo(code)) {
    return res.status(400).json({ message: 'Código inválido. Debe ser de 6 dígitos.' });
  }
  const vp = validarPassword(newPwd);
  if (!vp.ok) {
    return res.status(400).json({ message: 'La nueva contraseña no cumple con los requisitos.', errores: vp.errores });
  }

  let cn;
  try {
    cn = await db.getConnection();

    const user = await getUsuarioPorIdentificador(cn, identificador);

    // 🚫 Usuario/correo no existe
    if (!user) {
      return ENUMERATE
        ? res.status(404).json({ message: 'Usuario o correo no existen.' })
        : res.status(400).json({ message: 'No fue posible validar el código. Solicita uno nuevo.' });
    }

    // 🚫 Cuenta inactiva
    if (!esCuentaActiva(user.ESTADO)) {
      return ENUMERATE
        ? res.status(403).json({ message: 'La cuenta está inactiva. Contacta al administrador.' })
        : res.status(400).json({ message: 'No fue posible validar el código. Solicita uno nuevo.' });
    }

    // Obtener flujo activo
    const fr = await cn.execute(
      `SELECT ID, CODE_HASH, EXPIRA_EN
         FROM RECUPERACION_PWD
        WHERE USUARIO_ID = :p_uid AND ESTADO = 'ACTIVO'
        ORDER BY CREADO_EN DESC
        FETCH FIRST 1 ROWS ONLY`,
      { p_uid: user.ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const flow = fr.rows[0];
    if (!flow) {
      return res.status(400).json({ message: 'No fue posible validar el código. Solicita uno nuevo.' });
    }

    // Vigencia
    const vig = await cn.execute(
      `SELECT CASE WHEN SYSTIMESTAMP <= :p_expira_en THEN 1 ELSE 0 END AS V FROM DUAL`,
      { p_expira_en: flow.EXPIRA_EN },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (!vig.rows[0] || vig.rows[0].V !== 1) {
      return res.status(400).json({ message: 'El código ha expirado. Solicita uno nuevo.' });
    }

    // Comparar código
    const codigoOk = await bcrypt.compare(code, flow.CODE_HASH);
    if (!codigoOk) return res.status(400).json({ message: 'Código incorrecto.' });

    // Evitar reutilización (actual + últimas 5)
    if (user.PASSWORD_HASH && await bcrypt.compare(newPwd, user.PASSWORD_HASH)) {
      return res.status(400).json({ message: 'No puedes reutilizar tu contraseña actual.' });
    }
    const hr = await cn.execute(
      `SELECT PASSWORD_HASH
         FROM USUARIO_PASSWORD_HIST
        WHERE USUARIO_ID = :p_uid
        ORDER BY FECHA_CAMBIO DESC
        FETCH FIRST 5 ROWS ONLY`,
      { p_uid: user.ID },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    for (const row of hr.rows) {
      if (await bcrypt.compare(newPwd, row.PASSWORD_HASH)) {
        return res.status(400).json({ message: 'No puedes reutilizar ninguna de tus últimas 5 contraseñas.' });
      }
    }

    const newHash = await bcrypt.hash(newPwd, 12);

    await cn.execute(
      `UPDATE USUARIOS SET PASSWORD_HASH = :p_hash WHERE ID = :p_uid`,
      { p_hash: newHash, p_uid: user.ID }
    );

    await cn.execute(
      `INSERT INTO USUARIO_PASSWORD_HIST (USUARIO_ID, PASSWORD_HASH, FECHA_CAMBIO, ORIGEN, CAMBIADO_POR)
       VALUES (:p_uid, :p_hash, SYSTIMESTAMP, 'RESET', :p_uid)`,
      { p_uid: user.ID, p_hash: newHash }
    );

    // Conservar solo las últimas 5
    await cn.execute(
      `DELETE FROM USUARIO_PASSWORD_HIST
        WHERE USUARIO_ID = :p_uid
          AND ID NOT IN (
            SELECT ID FROM (
              SELECT ID
                FROM USUARIO_PASSWORD_HIST
               WHERE USUARIO_ID = :p_uid
               ORDER BY FECHA_CAMBIO DESC
            ) WHERE ROWNUM <= 5
          )`,
      { p_uid: user.ID }
    );

    await cn.execute(
      `UPDATE RECUPERACION_PWD
          SET ESTADO = 'USADO',
              USADO_EN = SYSTIMESTAMP
        WHERE ID = :p_id`,
      { p_id: flow.ID }
    );

    await cn.commit();
    return res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error /password/reset:', err);
    try { await cn?.rollback(); } catch {}
    return res.status(500).json({ message: 'Error interno.' });
  } finally {
    if (cn) try { await cn.close(); } catch {}
  }
};
