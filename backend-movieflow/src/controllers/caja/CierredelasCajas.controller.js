const db = require("../../config/db");
const oracledb = require("oracledb");

/**
 * 📌 Obtener la caja abierta de un usuario
 * GET /api/cierredelascajas/cajas-abiertas?usuario_id=#
 */
exports.getCajasAbiertas = async (req, res) => {
  let connection;
  const { usuario_id } = req.query;

  try {
    if (!usuario_id) {
      return res.status(400).json({ message: "usuario_id es requerido" });
    }

    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
          ac.id_apertura,
          ac.caja_id,
          c.nombre_caja,
          TO_CHAR(ac.fecha_apertura, 'DD/MM/YYYY') AS fecha_apertura,
          TO_CHAR(ac.hora_apertura, 'HH24:MI:SS') AS hora_apertura,
          ac.total_efectivo_inicial AS monto_apertura,
          ac.observaciones
       FROM pos_apertura_caja ac
       JOIN pos_cajas c ON ac.caja_id = c.id_caja
       WHERE ac.usuario_id = :usuario_id
         AND ac.estado_id = 1
       ORDER BY ac.fecha_apertura DESC, ac.hora_apertura DESC
       FETCH FIRST 1 ROWS ONLY`,
      { usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "El usuario no tiene ninguna caja abierta actualmente"
      });
    }

    const row = result.rows[0];
    res.json({
      id_apertura: row.ID_APERTURA,
      id_caja: row.CAJA_ID,
      nombre_caja: row.NOMBRE_CAJA,
      fecha_apertura: row.FECHA_APERTURA,
      hora_apertura: row.HORA_APERTURA,
      monto_apertura: row.MONTO_APERTURA,
      observaciones: row.OBSERVACIONES
    });
  } catch (error) {
    console.error("❌ Error al obtener caja abierta:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};

/**
 * 📌 Obtener la información detallada para cierre de una caja específica
 * GET /api/cierredelascajas/info?usuario_id=#&id_apertura=#
 */
exports.getInfoCierreCaja = async (req, res) => {
  let connection;
  const { usuario_id, id_apertura } = req.query;

  try {
    if (!usuario_id || !id_apertura) {
      return res.status(400).json({ message: "usuario_id e id_apertura son requeridos" });
    }

    connection = await db.getConnection();

    // 🔹 Fecha y hora del sistema
    const tiempoResult = await connection.execute(
      `SELECT 
          TO_CHAR(SYSDATE, 'DD/MM/YYYY') AS fecha_cierre,
          TO_CHAR(SYSTIMESTAMP, 'HH24:MI:SS') AS hora_cierre
       FROM dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const fecha_cierre = tiempoResult.rows[0]?.FECHA_CIERRE;
    const hora_cierre = tiempoResult.rows[0]?.HORA_CIERRE;

    // 🔹 Rol del usuario
    const rolResult = await connection.execute(
      `SELECT r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = :usuario_id`,
      { usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (rolResult.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    const rol_usuario = rolResult.rows[0].ROL;

    // 🔹 Datos de la apertura seleccionada
    const aperturaResult = await connection.execute(
      `SELECT 
          ac.id_apertura,
          ac.total_efectivo_inicial AS monto_apertura,
          c.nombre_caja
       FROM pos_apertura_caja ac
       JOIN pos_cajas c ON ac.caja_id = c.id_caja
       WHERE ac.id_apertura = :id_apertura
         AND ac.usuario_id = :usuario_id
         AND ac.estado_id = 1`,
      { id_apertura, usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (aperturaResult.rows.length === 0) {
      return res.status(404).json({ message: "La apertura indicada no está activa" });
    }

    const { ID_APERTURA, MONTO_APERTURA, NOMBRE_CAJA } = aperturaResult.rows[0];

    // 🔹 Total de ventas del día en esa caja
    const ventasResult = await connection.execute(
      `SELECT NVL(SUM(total), 0) AS total_ventas
       FROM pos_ventas
       WHERE caja_id = (
         SELECT caja_id FROM pos_apertura_caja WHERE id_apertura = :id_apertura
       )
         AND usuario_id = :usuario_id
         AND TRUNC(fecha) = TRUNC(SYSDATE)`,
      { id_apertura, usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const total_ventas = ventasResult.rows[0].TOTAL_VENTAS;
    const monto_esperado = (MONTO_APERTURA || 0) + (total_ventas || 0);

    res.json({
      abierta: true,
      fecha_cierre,
      hora_cierre,
      rol_usuario,
      nombre_caja: NOMBRE_CAJA,
      id_apertura: ID_APERTURA,
      monto_apertura: MONTO_APERTURA,
      total_ventas,
      monto_esperado
    });
  } catch (error) {
    console.error("❌ Error al obtener info de cierre de caja:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};

/**
 * 📌 Registrar cierre de caja (con denominaciones) y devolver ticket
 * POST /api/registrar-cierre
 * Body: { usuario_id, apertura_id, denominaciones: [{denominacion_id, cantidad}], observaciones?, admin_id? }
 */
/**
 * 📌 Registrar cierre de caja (con denominaciones) y devolver ticket
 * POST /api/registrar-cierre
 * Body: { usuario_id, apertura_id, denominaciones: [{denominacion_id, cantidad}], observaciones?, admin_id? }
 */
exports.registrarCierre = async (req, res) => {
  let connection;
  const { usuario_id, apertura_id, denominaciones, observaciones, admin_id } = req.body;

  try {
    if (!usuario_id || !apertura_id || !Array.isArray(denominaciones) || denominaciones.length === 0) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    connection = await db.getConnection();

    // 1) Apertura activa del usuario
    const aperturaResult = await connection.execute(
      `SELECT id_apertura, caja_id, total_efectivo_inicial
         FROM pos_apertura_caja
        WHERE id_apertura = :apertura_id
          AND usuario_id = :usuario_id
          AND estado_id = 1`,
      { apertura_id, usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (aperturaResult.rows.length === 0) {
      return res.status(400).json({ message: "Apertura no activa o no pertenece al usuario" });
    }
    const cajaId        = aperturaResult.rows[0].CAJA_ID;
    const montoApertura = Number(aperturaResult.rows[0].TOTAL_EFECTIVO_INICIAL || 0);

    // 2) Calcular total contado y validar denominaciones
    let totalContado = 0;
    for (const d of denominaciones) {
      if (!d || d.cantidad == null || d.cantidad < 0) {
        return res.status(400).json({ message: "Denominación con cantidad inválida" });
      }
      const valRes = await connection.execute(
        `SELECT valor FROM pos_denominaciones WHERE id_denominacion = :id`,
        { id: d.denominacion_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (valRes.rows.length === 0) {
        return res.status(400).json({ message: `Denominación inválida: ${d.denominacion_id}` });
      }
      const valor = Number(valRes.rows[0].VALOR);
      totalContado += Number(d.cantidad) * valor;
    }

    // 3) Total ventas del día de esa caja/usuario
    const ventasResult = await connection.execute(
      `SELECT NVL(SUM(total), 0) AS total_ventas
         FROM pos_ventas
        WHERE caja_id = :caja_id
          AND usuario_id = :usuario_id
          AND TRUNC(fecha) = TRUNC(SYSDATE)`,
      { caja_id: cajaId, usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const montoVentas   = Number(ventasResult.rows[0].TOTAL_VENTAS || 0);
    const montoEsperado = montoApertura + montoVentas;
    const diferencia    = Number((totalContado - montoEsperado).toFixed(2));

    // 4) Obtener siguiente ticket (sin trigger)
    const nextTicketRes = await connection.execute(
      `SELECT LPAD(NVL(MAX(TO_NUMBER(numero_ticket)),0) + 1, 5, '0') AS NEXT_TICKET
         FROM pos_cierre_caja`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const numeroTicket = nextTicketRes.rows[0].NEXT_TICKET;

    // 5) Insertar cierre
    await connection.execute(`BEGIN NULL; END;`);
    await connection.execute(`ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD'`);

    const insertCierre = await connection.execute(
      `INSERT INTO pos_cierre_caja
         (apertura_id, usuario_id, fecha_cierre, hora_cierre,
          monto_apertura, monto_ventas, monto_esperado, monto_contado, diferencia,
          estado_id, observaciones, numero_ticket, admin_id)
       VALUES
         (:apertura_id, :usuario_id, TRUNC(SYSDATE), SYSTIMESTAMP,
          :monto_apertura, :monto_ventas, :monto_esperado, :monto_contado, :diferencia,
          1, :observaciones, :numero_ticket, :admin_id)
       RETURNING id_cierre INTO :id_cierre`,
      {
        apertura_id,
        usuario_id,
        monto_apertura: montoApertura,
        monto_ventas: montoVentas,
        monto_esperado: montoEsperado,
        monto_contado: totalContado,
        diferencia,
        observaciones: observaciones || null,
        numero_ticket: numeroTicket,
        admin_id: admin_id || null,
        id_cierre: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );

    const cierreId = insertCierre.outBinds.id_cierre[0];

    // 6) Insertar detalle de denominaciones
    for (const d of denominaciones) {
      const valRes = await connection.execute(
        `SELECT valor FROM pos_denominaciones WHERE id_denominacion = :id`,
        { id: d.denominacion_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const valor = Number(valRes.rows[0].VALOR);
      const subtotal = Number(d.cantidad) * valor;

      await connection.execute(
        `INSERT INTO pos_cierre_denominacion
           (cierre_id, denominacion_id, cantidad, subtotal)
         VALUES
           (:cierre_id, :denominacion_id, :cantidad, :subtotal)`,
        {
          cierre_id: cierreId,
          denominacion_id: d.denominacion_id,
          cantidad: d.cantidad,
          subtotal
        },
        { autoCommit: false }
      );
    }

    // 7) Cerrar apertura (estado_id = 2)
    await connection.execute(
      `UPDATE pos_apertura_caja SET estado_id = 2 WHERE id_apertura = :id`,
      { id: apertura_id },
      { autoCommit: false }
    );

    await connection.commit();

    return res.json({
      message: "✅ Caja cerrada correctamente",
      cierre_id: cierreId,
      numero_ticket: numeroTicket
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error al registrar cierre:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
