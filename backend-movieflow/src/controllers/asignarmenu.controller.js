const db = require('../config/db');
const xss = require('xss');
const oracledb = require('oracledb');

/**
 * Asigna permisos a un rol: agrega nuevos y elimina los que ya no estén seleccionados.
 * Si el rol es 'administrador', no se permite eliminar submódulos.
 */
exports.asignarPermisos = async (req, res) => {
  const rawRolId = req.body.rolId;
  const rawPermisos = req.body.permisos;

  const rolId = parseInt(xss(rawRolId));
  const permisos = Array.isArray(rawPermisos) ? rawPermisos : [];

  if (!rolId) {
    return res.status(400).json({ message: 'ID de rol inválido.' });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // Obtener nombre del rol
    const resultRol = await connection.execute(
      `SELECT ID, NOMBRE FROM ROLES WHERE ID = :id`,
      [rolId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (resultRol.rows.length === 0) {
      return res.status(404).json({ message: 'Rol no encontrado.' });
    }

    const nombreRol = resultRol.rows[0].NOMBRE.trim().toLowerCase();

    // Limpieza de permisos entrantes
    const permisosLimpios = permisos.map(p => ({
      modulo_id: parseInt(xss(p.modulo_id)),
      submodulo_id: parseInt(xss(p.submodulo_id)),
      active: 1
    })).filter(p =>
      Number.isInteger(p.modulo_id) && Number.isInteger(p.submodulo_id)
    );

    // Permisos actuales del rol
    const resultExistentes = await connection.execute(
      `SELECT MODULO_ID, SUBMODULO_ID FROM PERMISOS 
       WHERE ROLES_ID = :rolId AND ACTIVE = 1`,
      [rolId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const actuales = new Set(resultExistentes.rows.map(p => `${p.MODULO_ID}-${p.SUBMODULO_ID}`));
    const nuevos = new Set(permisosLimpios.map(p => `${p.modulo_id}-${p.submodulo_id}`));

    const permisosAInsertar = permisosLimpios.filter(p => {
      const key = `${p.modulo_id}-${p.submodulo_id}`;
      return !actuales.has(key);
    });

    const permisosAEliminar = Array.from(actuales).filter(key => !nuevos.has(key));

    // 🚫 Si es administrador y hay eliminación, bloquear operación
    if (nombreRol === 'administrador' && permisosAEliminar.length > 0) {
      return res.status(403).json({
        message: 'No se pueden eliminar submódulos del rol administrador.'
      });
    }

    // Eliminar permisos si aplica
    for (const key of permisosAEliminar) {
      const [modulo_id, submodulo_id] = key.split('-').map(Number);
      await connection.execute(
        `DELETE FROM PERMISOS 
         WHERE ROLES_ID = :rol AND MODULO_ID = :mod AND SUBMODULO_ID = :sub`,
        [rolId, modulo_id, submodulo_id],
        { autoCommit: false }
      );
    }

    // Insertar nuevos permisos
    if (permisosAInsertar.length > 0) {
      const inserts = permisosAInsertar.map(p => [
        rolId, p.modulo_id, p.submodulo_id, p.active
      ]);
      await connection.executeMany(
        `INSERT INTO PERMISOS (ROLES_ID, MODULO_ID, SUBMODULO_ID, ACTIVE)
         VALUES (:1, :2, :3, :4)`,
        inserts,
        { autoCommit: false }
      );
    }

    await connection.commit();

    return res.status(200).json({
      message: 'Permisos actualizados correctamente.'
    });

  } catch (error) {
    console.error('Error al asignar permisos:', error);
    return res.status(500).json({ message: 'Error al asignar permisos', error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar la conexión:', err);
      }
    }
  }
};

/**
 * Devuelve todos los módulos con sus submódulos.
 */
exports.obtenerModulosYSubmodulos = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
         m.ID AS MODULO_ID,
         m.NAME AS MODULO_NAME,
         m.ICON AS MODULO_ICON,
         m.ROUTE AS MODULO_ROUTE,
         s.ID AS SUBMODULO_ID,
         s.NAME AS SUBMODULO_NAME,
         s.ROUTE AS SUBMODULO_ROUTE,
         s.ICON AS SUBMODULO_ICON
       FROM MODULO m
       LEFT JOIN SUBMODULO s ON s.MODULO_ID = m.ID
       ORDER BY m.ID, s.ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const modulosMap = new Map();

    result.rows.forEach(row => {
      const id = row.MODULO_ID;
      if (!modulosMap.has(id)) {
        modulosMap.set(id, {
          ID: id,
          NOMBRE: row.MODULO_NAME,
          ICONO: row.MODULO_ICON,
          RUTA: row.MODULO_ROUTE,
          SUBMODULOS: []
        });
      }

      if (row.SUBMODULO_ID) {
        modulosMap.get(id).SUBMODULOS.push({
          ID: row.SUBMODULO_ID,
          NOMBRE: row.SUBMODULO_NAME,
          RUTA: row.SUBMODULO_ROUTE,
          ICONO: row.SUBMODULO_ICON
        });
      }
    });

    return res.status(200).json(Array.from(modulosMap.values()));

  } catch (error) {
    console.error('Error al obtener módulos:', error);
    return res.status(500).json({ message: 'Error al obtener módulos', error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar la conexión:', err);
      }
    }
  }
};

/**
 * Devuelve la cantidad de permisos asignados por rol.
 */
exports.getCantidadPermisosPorRol = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT ROLES_ID, COUNT(*) AS TOTAL FROM PERMISOS 
       WHERE ACTIVE = 1 GROUP BY ROLES_ID`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const conteo = result.rows.map(row => ({
      rol_id: row.ROLES_ID,
      total: row.TOTAL
    }));

    return res.status(200).json(conteo);

  } catch (error) {
    console.error('Error al contar permisos por rol:', error);
    return res.status(500).json({ message: 'Error al contar permisos por rol', error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar la conexión:', err);
      }
    }
  }
};

/**
 * Devuelve los permisos actuales asignados a un rol específico.
 */
exports.getPermisosPorRol = async (req, res) => {
  const rolId = parseInt(req.params.rolId);
  if (!rolId) return res.status(400).json({ message: 'ID de rol inválido' });

  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT MODULO_ID, SUBMODULO_ID 
       FROM PERMISOS 
       WHERE ROLES_ID = :rolId AND ACTIVE = 1`,
      [rolId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error al obtener permisos del rol:', error);
    return res.status(500).json({ message: 'Error al obtener permisos del rol', error: error.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error al cerrar la conexión:', err);
      }
    }
  }
};
