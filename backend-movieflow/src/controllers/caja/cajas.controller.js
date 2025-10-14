const db = require("../../config/db");
const oracledb = require("oracledb");

// 🔹 Consultar el último estado de la caja de un usuario
exports.getEstadoCajaPorUsuario = async (req, res) => {
  let connection;
  const { usuario_id } = req.query;

  try {
    console.log("🔎 [getEstadoCajaPorUsuario] usuario_id =", usuario_id);
    if (!usuario_id) {
      return res.status(400).json({ message: "usuario_id es requerido" });
    }

    connection = await db.getConnection();

    // Detecto el id real de “abierta” (tolerante a variantes como ABIERA/ABIERTA)
    const estadoAbiertaRes = await connection.execute(
      `SELECT id_estado
         FROM POS_ESTADO_CAJA
        WHERE UPPER(nombre_estado) LIKE 'ABIER%'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const idEstadoAbierta = estadoAbiertaRes.rows[0]?.ID_ESTADO;
    console.log("ℹ️ [getEstadoCajaPorUsuario] idEstadoAbierta =", idEstadoAbierta);

    const result = await connection.execute(
      `SELECT ac.id_apertura,
              ac.caja_id,
              c.nombre_caja,
              ac.turno_id,
              ac.estado_id,
              e.nombre_estado
       FROM POS_APERTURA_CAJA ac
       JOIN POS_CAJAS c ON ac.caja_id = c.id_caja
       JOIN POS_ESTADO_CAJA e ON ac.estado_id = e.id_estado
       WHERE ac.usuario_id = :usuario_id
       ORDER BY ac.id_apertura DESC
       FETCH FIRST 1 ROWS ONLY`,
      { usuario_id: Number(usuario_id) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      console.log("ℹ️ [getEstadoCajaPorUsuario] Sin aperturas para el usuario");
      return res.json({
        abierta: false,
        message: "El usuario no tiene ninguna caja abierta actualmente"
      });
    }

    const datos = result.rows[0];
    const abierta = idEstadoAbierta
      ? Number(datos.ESTADO_ID) === Number(idEstadoAbierta)
      : (String(datos.NOMBRE_ESTADO || "").toUpperCase().startsWith("ABIER")); // fallback

    console.log("📋 [getEstadoCajaPorUsuario] última:", datos, "abierta:", abierta);

    res.json({ abierta, datos });
  } catch (error) {
    console.error("❌ [getEstadoCajaPorUsuario] Error consultando estado de caja:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  } finally {
    if (connection) await connection.close();
  }
};
