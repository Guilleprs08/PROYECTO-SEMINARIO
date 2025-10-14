const bcrypt = require('bcrypt');
const { registrarAuditoria } = require('./auditoria.controller');
const db = require('../config/db');
const oracledb = require('oracledb');

// ✅ GET: Obtener todos los usuarios con nombre de estado y rol
exports.getUsuarios = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
         u.ID, 
         u.NOMBRE, 
         u.CORREO, 
         u.USUARIO, 
         u.PASSWORD_HASH, 
         u.ESTADO, 
         r.NOMBRE AS ROLE_NOMBRE, 
         e.NOMBRE AS ESTADO_NOMBRE
       FROM USUARIOS u
       JOIN ROLES r ON u.ROLE_ID = r.ID
       JOIN ESTADOS_USUARIO e ON u.ESTADO = e.ID
       ORDER BY u.ID DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[ERROR] Error al obtener usuarios:', error);
    res.status(500).json({ message: 'Error interno al obtener usuarios' });
  } finally {
    if (connection) await connection.close();
  }
};

// ✅ POST: Crear nuevo usuario
exports.nuevoUsuario = async (req, res) => {
  const { nombre, correo, usuario, contrasena, estado, rol, id_admin } = req.body;
  let connection;

  try {
    connection = await db.getConnection();

    const hashedPassword = await bcrypt.hash(contrasena, 10);

    const result = await connection.execute(
      `INSERT INTO usuarios (NOMBRE, CORREO, USUARIO, PASSWORD_HASH, ESTADO, ROLE_ID)
       VALUES (:nombre, :correo, :usuario, :password, :estado, :rol)
       RETURNING ID INTO :id`,
      {
        nombre,
        correo,
        usuario,
        password: hashedPassword,
        estado,
        rol,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
      },
      { autoCommit: true }
    );

    const nuevoId = result.outBinds.id[0];

    const [estadoRes, rolRes] = await Promise.all([
      connection.execute(`SELECT NOMBRE FROM ESTADOS_USUARIO WHERE ID = :id`, [estado], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(`SELECT NOMBRE FROM ROLES WHERE ID = :id`, [rol], { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    const estadoNombre = estadoRes.rows[0]?.NOMBRE || `ID ${estado}`;
    const rolNombre = rolRes.rows[0]?.NOMBRE || `ID ${rol}`;

    const descripcion = `Nombre: ${nombre} | Usuario: ${usuario} | Correo: ${correo} | Estado: ${estadoNombre} | Rol: ${rolNombre}`;

    await registrarAuditoria({
      id_admin,
      id_usuario_editado: nuevoId,
      campo_modificado: 'CREACIÓN',
      valor_anterior: null,
      valor_nuevo: descripcion
    });

    return res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error('[ERROR] Error al crear usuario:', error);
    return res.status(500).json({ message: 'Error interno al crear usuario' });
  } finally {
    if (connection) await connection.close();
  }
};
