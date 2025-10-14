 
const db = require("../../config/db");
const oracledb = require("oracledb");

/**
 * 🔹 Registrar cierre de caja
 * Valida que monto contado = monto esperado antes de cerrar,
 * o que si sobra dinero se obliguen observaciones.
 */
exports.registrarCierreCaja = async (req, res) => {
  let connection;
  const { usuario_id, apertura_id, denominaciones, observaciones } = req.body;

  try {
    if (!usuario_id || !apertura_id || !denominaciones || denominaciones.length === 0) {
      return res.status(400).json({ message: "Faltan datos obligatorios" });
    }

    connection = await db.getConnection();

    // 1️⃣ Traer datos de apertura (incluye monto_apertura)
    const aperturaResult = await connection.execute(
      `SELECT total_efectivo_inicial, caja_id
       FROM pos_apertura_caja
       WHERE id_apertura = :apertura_id
         AND estado_id = 1`, // solo aperturas abiertas
      { apertura_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (aperturaResult.rows.length === 0) {
      return res.status(400).json({ message: "No se encontró apertura activa para cerrar" });
    }

    const { TOTAL_EFECTIVO_INICIAL, CAJA_ID } = aperturaResult.rows[0];

    // 2️⃣ Calcular total de ventas del día en esa caja
    const ventasResult = await connection.execute(
      `SELECT NVL(SUM(total),0) AS total_ventas
       FROM pos_ventas
       WHERE caja_id = :caja_id
         AND usuario_id = :usuario_id
         AND fecha BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 0.99999`,
      { caja_id: CAJA_ID, usuario_id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const total_ventas = ventasResult.rows[0].TOTAL_VENTAS;
    const monto_esperado = (TOTAL_EFECTIVO_INICIAL || 0) + (total_ventas || 0);

    // 3️⃣ Insertar registro de cierre_caja
    const cierreResult = await connection.execute(
      `INSERT INTO pos_cierre_caja
         (apertura_id, usuario_id, monto_apertura, monto_ventas, monto_esperado, observaciones, estado_id)
       VALUES (:apertura_id, :usuario_id, :monto_apertura, :monto_ventas, :monto_esperado, :observaciones, 1)
       RETURNING id_cierre INTO :id_cierre`,
      {
        apertura_id,
        usuario_id,
        monto_apertura: TOTAL_EFECTIVO_INICIAL,
        monto_ventas: total_ventas,
        monto_esperado,
        observaciones: observaciones || null,
        id_cierre: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );

    const id_cierre = cierreResult.outBinds.id_cierre[0];

    // 4️⃣ Insertar denominaciones del cierre
    for (const d of denominaciones) {
      await connection.execute(
        `INSERT INTO pos_cierre_denominacion (cierre_id, denominacion_id, cantidad, subtotal)
         VALUES (:cierre_id, :denominacion_id, :cantidad, 0)`, // subtotal lo calcula el trigger
        {
          cierre_id: id_cierre,
          denominacion_id: d.denominacion_id,
          cantidad: d.cantidad
        },
        { autoCommit: false }
      );
    }

    // 5️⃣ Consultar monto_contado (calculado por trigger)
    const contadoResult = await connection.execute(
      `SELECT monto_contado
       FROM pos_cierre_caja
       WHERE id_cierre = :id_cierre`,
      { id_cierre },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const monto_contado = contadoResult.rows[0].MONTO_CONTADO;

    // 6️⃣ Validar contra monto esperado
    if (monto_contado < monto_esperado) {
      await connection.rollback();
      return res.status(400).json({
        message: `❌ No cuadra el cierre. Faltan Q${(monto_esperado - monto_contado).toFixed(2)}`
      });
    }

    if (monto_contado > monto_esperado) {
      if (!observaciones || observaciones.trim() === "") {
        await connection.rollback();
        return res.status(400).json({
          message: `❌ El monto contado supera al esperado (Esperado: Q${monto_esperado}, Contado: Q${monto_contado}). Debe ingresar observaciones para continuar.`
        });
      }

      // Guardar diferencia
      await connection.execute(
        `UPDATE pos_cierre_caja
         SET diferencia = :diferencia
         WHERE id_cierre = :id_cierre`,
        {
          diferencia: monto_contado - monto_esperado,
          id_cierre
        },
        { autoCommit: false }
      );
    }

    // 7️⃣ Marcar apertura como cerrada
    await connection.execute(
      `UPDATE pos_apertura_caja
       SET estado_id = 2
       WHERE id_apertura = :apertura_id`,
      { apertura_id },
      { autoCommit: false }
    );

    // 8️⃣ Marcar cierre como confirmado
    await connection.execute(
      `UPDATE pos_cierre_caja
       SET estado_id = 2
       WHERE id_cierre = :id_cierre`,
      { id_cierre },
      { autoCommit: false }
    );

    await connection.commit();

    res.json({
      message: "✅ Caja cerrada correctamente",
      cierre_id: id_cierre,
      monto_contado,
      monto_esperado
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Error al cerrar caja:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
