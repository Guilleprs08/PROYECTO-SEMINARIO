const db = require("../../config/db");
const oracledb = require("oracledb");

//
// 🔹 Listar denominaciones (solo campo valor)
//
exports.listarDenominaciones = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT id_denominacion, valor
         FROM pos_denominaciones
        ORDER BY valor DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error al obtener denominaciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};

//
// 🔹 Apertura de caja con denominaciones
//
exports.abrirCaja = async (req, res) => {
  let connection;
  const {
    usuario_id,
    caja_id,
    turno_id,
    estado_id,
    denominaciones,
    observaciones,
  } = req.body;

  try {
    connection = await db.getConnection();

    // ==============================
    // 🔹 VALIDACIONES BACKEND
    // ==============================

    // 1️⃣ Validar parámetros obligatorios
    if (!usuario_id || !caja_id || !turno_id || !estado_id) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    // 2️⃣ Validar existencia en tablas relacionadas
    const checkFK = async (table, field, value) => {
      const result = await connection.execute(
        `SELECT COUNT(*) AS total FROM ${table} WHERE ${field} = :value`,
        { value },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows[0].TOTAL > 0;
    };

    const [usuarioOk, cajaOk, turnoOk, estadoOk] = await Promise.all([
      checkFK("usuarios", "id", usuario_id), // ✅ PK de usuarios
      checkFK("pos_cajas", "id_caja", caja_id), // ✅ PK de cajas
      checkFK("pos_turnos", "id_turno", turno_id), // ✅ PK de turnos
      checkFK("pos_estado_caja", "id_estado", estado_id), // ✅ PK de estado_caja
    ]);

    if (!usuarioOk) return res.status(400).json({ message: "Usuario no existe" });
    if (!cajaOk) return res.status(400).json({ message: "Caja no existe" });
    if (!turnoOk) return res.status(400).json({ message: "Turno no existe" });
    if (!estadoOk) return res.status(400).json({ message: "Estado de caja no existe" });

    // 3️⃣ Validar que el usuario no tenga ya una caja abierta
    const aperturaUsuario = await connection.execute(
      `SELECT COUNT(*) AS total
         FROM pos_apertura_caja
        WHERE usuario_id = :usuario_id
          AND estado_id = 1`, // 1 = ABIERTA
      { usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (aperturaUsuario.rows[0].TOTAL > 0) {
      return res.status(400).json({
        message: "❌ El usuario ya tiene una caja abierta y no puede abrir otra"
      });
    }

    // 4️⃣ Validar que no exista ya apertura activa para esa caja y turno
    const aperturaExistente = await connection.execute(
      `SELECT COUNT(*) AS total
         FROM pos_apertura_caja
        WHERE caja_id = :caja_id
          AND turno_id = :turno_id
          AND estado_id = 1`, // 1 = ABIERTA
      { caja_id, turno_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (aperturaExistente.rows[0].TOTAL > 0) {
      return res.status(400).json({
        message: "Ya existe una apertura activa para esta caja en este turno",
      });
    }

    // 5️⃣ Validar denominaciones
    if (!denominaciones || denominaciones.length === 0) {
      return res
        .status(400)
        .json({ message: "Debe ingresar denominaciones" });
    }

    let totalCantidad = 0;
    let faltantes = 0;

    for (const d of denominaciones) {
      // a. Validar que la denominación exista
      const denomOk = await checkFK(
        "pos_denominaciones",
        "id_denominacion",
        d.denominacion_id
      );
      if (!denomOk) {
        return res.status(400).json({
          message: `Denominación inválida: ${d.denominacion_id}`,
        });
      }

      // b. Validar que no sea negativa
      if (d.cantidad < 0) {
        return res.status(400).json({
          message: `Cantidad inválida en denominación ${d.denominacion_id}`,
        });
      }

      if (d.cantidad === 0) faltantes++;
      totalCantidad += d.cantidad;
    }

    // c. Si todas las cantidades son 0
    if (totalCantidad === 0) {
      return res
        .status(400)
        .json({ message: "Debe ingresar al menos una denominación" });
    }

    // d. Si falta alguna denominación → observaciones obligatorio
    if (faltantes > 0 && (!observaciones || observaciones.trim() === "")) {
      return res.status(400).json({
        message: "Debe ingresar observaciones si falta alguna denominación",
      });
    }

    // ==============================
    // 🔹 INSERCIÓN
    // ==============================
    await connection.execute(`BEGIN NULL; END;`); // asegura contexto
    await connection.execute(
      "ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD'"
    );

    // Insertar apertura
    const result = await connection.execute(
      `INSERT INTO pos_apertura_caja 
         (usuario_id, caja_id, turno_id, estado_id, observaciones)
       VALUES (:usuario_id, :caja_id, :turno_id, :estado_id, :observaciones)
       RETURNING id_apertura INTO :id_apertura`,
      {
        usuario_id,
        caja_id,
        turno_id,
        estado_id,
        observaciones: observaciones || null,
        id_apertura: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: false }
    );

    const aperturaId = result.outBinds.id_apertura[0];

    // Insertar denominaciones con subtotal
    for (const d of denominaciones) {
      // 🔹 calcular subtotal en backend
      const denomData = await connection.execute(
        `SELECT valor FROM pos_denominaciones WHERE id_denominacion = :id`,
        { id: d.denominacion_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const valor = denomData.rows[0].VALOR;
      const subtotal = d.cantidad * valor;

      await connection.execute(
        `INSERT INTO pos_apertura_denominacion 
           (apertura_id, denominacion_id, cantidad, subtotal)
         VALUES (:apertura_id, :denominacion_id, :cantidad, :subtotal)`,
        {
          apertura_id: aperturaId,
          denominacion_id: d.denominacion_id,
          cantidad: d.cantidad,
          subtotal,
        },
        { autoCommit: false }
      );
    }

    await connection.commit();

    // ==============================
    // 🔹 OBTENER NUMERO_TICKET GENERADO
    // ==============================
    const ticketResult = await connection.execute(
      `SELECT numero_ticket 
         FROM pos_apertura_caja
        WHERE id_apertura = :id`,
      { id: aperturaId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const numeroTicket = ticketResult.rows[0]?.NUMERO_TICKET;

    res.json({
      message: "✅ Caja aperturada con éxito",
      apertura_id: aperturaId,
      numero_ticket: numeroTicket, // 👈 agregado
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error al abrir caja:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
