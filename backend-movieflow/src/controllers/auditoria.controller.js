// src/controllers/auditoria.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');

async function registrarAuditoria({
  id_admin,
  id_usuario_editado,
  campo_modificado,
  valor_anterior,
  valor_nuevo
}) {
  let connection;

  try {
    // Validación de campos obligatorios
    if (!id_admin || !id_usuario_editado || !campo_modificado) {
      console.error('[AUDITORIA] Campos requeridos faltantes:', {
        id_admin,
        id_usuario_editado,
        campo_modificado
      });
      return;
    }

    console.log('[AUDITORIA] Intentando registrar auditoría con los datos:', {
      id_admin,
      id_usuario_editado,
      campo_modificado,
      valor_anterior,
      valor_nuevo
    });

    connection = await db.getConnection();
    console.log('[AUDITORIA] Conexión a la base de datos establecida');

    // 👉 Tabla correcta: POS_REGISTRO_AUDITORIA
    const sql = `
      INSERT INTO POS_REGISTRO_AUDITORIA (
        ID_ADMIN,
        ID_USUARIO_EDITADO,
        CAMPO_MODIFICADO,
        VALOR_ANTERIOR,
        VALOR_NUEVO,
        FECHA_HORA_MODIFICACION
      ) VALUES (
        :id_admin,
        :id_usuario_editado,
        :campo_modificado,
        :valor_anterior,
        :valor_nuevo,
        SYSTIMESTAMP
      )
    `;

    const result = await connection.execute(
      sql,
      {
        id_admin,
        id_usuario_editado,
        campo_modificado,
        valor_anterior: valor_anterior ?? null,
        valor_nuevo: valor_nuevo ?? null
      },
      { autoCommit: true }
    );

    console.log(`[AUDITORIA] Auditoría registrada. Filas afectadas: ${result.rowsAffected}`);
  } catch (error) {
    // Si por alguna razón la tabla no existe en este ambiente, no rompemos el flujo principal
    if (error && error.errorNum === 942) {
      console.warn('[AUDITORIA] Tabla POS_REGISTRO_AUDITORIA no existe. Se omite registro en este entorno.');
    } else {
      console.error('[AUDITORIA] Error al registrar auditoría:', error);
    }
  } finally {
    try {
      await connection?.close();
      console.log('[AUDITORIA] Conexión cerrada');
    } catch {
      /* no-op */
    }
  }
}

module.exports = { registrarAuditoria };
