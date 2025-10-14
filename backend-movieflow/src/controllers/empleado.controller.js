// src/controllers/empleado.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');
const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };


// Precio unitario de la función
async function getFuncionPrecio(cn, funcionId) {
  const r = await cn.execute(
    `SELECT PRECIO AS "precio" FROM FUNCIONES WHERE ID_FUNCION = :id`,
    { id: Number(funcionId) },
    OUT_OBJ
  );
  return r.rows?.[0]?.precio ? Number(r.rows[0].precio) : 0;
}

// Crea un "cliente de mostrador" mínimo para ventas en taquilla
async function ensureWalkinClient(cn, datos = {}) {
  const prov = 'taquilla';
  const sub = `walkin:${crypto.randomUUID()}`;
  const r = await cn.execute(
    `INSERT INTO CLIENTES(
       PROVIDER, PROVIDER_SUB, EMAIL, NOMBRE, FECHA_CREACION, ULTIMO_INGRESO
     ) VALUES (
       :prov, :sub, :email, :nombre, SYSTIMESTAMP, SYSTIMESTAMP
     ) RETURNING ID_CLIENTE INTO :id`,
    {
      prov,
      sub,
      email: datos.email || null,
      nombre: datos.nombre || 'Mostrador',
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
    { autoCommit: false }
  );
  return Number(r.outBinds.id[0]);
}

// Genera placeholders :id0,:id1,...
function bindList(prefix, arr, target) {
  return arr.map((v, i) => {
    target[`${prefix}${i}`] = Number(v);
    return `:${prefix}${i}`;
  });
}

/* ===================== CARTELERA ===================== */
exports.getCartelera = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const sql = `
      SELECT
        p.ID_PELICULA                      AS id,
        p.TITULO                           AS titulo,
        p.DURACION_MINUTOS                 AS duracionMin,
        p.ESTADO                           AS estado,
        cat.NOMBRE                         AS categoriaNombre,
        idi.NOMBRE                         AS idioma,
        cla.NOMBRE                         AS clasificacion,
        CASE WHEN p.IMAGEN_URL IS NULL THEN NULL
             ELSE DBMS_LOB.SUBSTR(p.IMAGEN_URL, 4000, 1) END AS imagenUrl
      FROM PELICULA p
      LEFT JOIN CATEGORIAS     cat ON cat.ID_CATEGORIA     = p.ID_CATEGORIA
      LEFT JOIN IDIOMAS        idi ON idi.ID_IDIOMA        = p.ID_IDIOMA
      LEFT JOIN CLASIFICACION  cla ON cla.ID_CLASIFICACION = p.ID_CLASIFICACION
      WHERE p.ESTADO = 'ACTIVA'
      ORDER BY p.TITULO ASC
    `;
    const r = await cn.execute(sql, {}, OUT_OBJ);

    // NORMALIZACIÓN DE ALIAS (Oracle envía MAYÚSCULAS si no van con comillas)
    const rows = (r.rows || []).map((R) => ({
      id: R.id ?? R.ID,
      titulo: R.titulo ?? R.TITULO,
      duracionMin: R.duracionMin ?? R.DURACIONMIN,
      estado: R.estado ?? R.ESTADO,
      categoriaNombre: R.categoriaNombre ?? R.CATEGORIANOMBRE,
      idioma: R.idioma ?? R.IDIOMA,
      clasificacion: R.clasificacion ?? R.CLASIFICACION,
      imagenUrl: String(R.imagenUrl ?? R.IMAGENURL ?? '').replace(/\\/g, '/'),
    }));

    res.json(rows);
  } catch (e) {
    console.error('GET /api/empleado/cartelera ->', e);
    res.status(500).json({ message: 'Error al obtener cartelera' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/* ===================== FUNCIONES ===================== */
// src/controllers/empleado.controller.js
exports.getFuncionesByPelicula = async (req, res) => {
  let cn;
  try {
    const { peliculaId } = req.params;
    const { fecha } = req.query;
    cn = await db.getConnection();

    const where = [`f.ESTADO = 'ACTIVA'`, `f.ID_PELICULA = :peliculaId`];
    const bind = { peliculaId: Number(peliculaId) };
    if ((fecha || '').trim()) {
      where.push(`f.FECHA = TO_DATE(:fecha,'YYYY-MM-DD')`);
      bind.fecha = fecha.trim();
    }

    const sql = `
      SELECT
        f.ID_FUNCION AS "id",
        f.ID_PELICULA AS "peliculaId",
        f.ID_SALA     AS "salaId",
        TO_CHAR(f.FECHA,'YYYY-MM-DD') AS "fecha",
        TO_CHAR(f.FECHA + f.HORA_INICIO,'HH24:MI') AS "horaInicio",
        TO_CHAR(
          f.FECHA + f.HORA_FINAL
          + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                 THEN NUMTODSINTERVAL(1,'DAY')
                 ELSE NUMTODSINTERVAL(0,'DAY') END,
          'HH24:MI'
        ) AS "horaFinal",
        f.PRECIO   AS "precio",
        s.NOMBRE   AS "salaNombre",
        frm.NOMBRE AS "formato",
        /* ---- contadores para SOLD OUT ---- */
        (SELECT COUNT(*) FROM FUNCION_ASIENTO fa
          WHERE fa.ID_FUNCION = f.ID_FUNCION) AS "totalSeats",
        (SELECT COUNT(*) FROM FUNCION_ASIENTO fa
          WHERE fa.ID_FUNCION = f.ID_FUNCION AND fa.ESTADO = 'VENDIDO') AS "vendidos",
        (SELECT COUNT(*) FROM FUNCION_ASIENTO fa
          WHERE fa.ID_FUNCION = f.ID_FUNCION AND fa.ESTADO = 'RESERVADO') AS "reservados",
        (SELECT COUNT(*) FROM FUNCION_ASIENTO fa
          WHERE fa.ID_FUNCION = f.ID_FUNCION
            AND (fa.ESTADO='DISPONIBLE'
                 OR (fa.ESTADO='BLOQUEADO' AND (fa.BLOQUEADO_HASTA IS NULL OR fa.BLOQUEADO_HASTA <= SYSTIMESTAMP))
            )
        ) AS "disponibles"
      FROM FUNCIONES f
      JOIN SALAS s      ON s.ID_SALA = f.ID_SALA
      LEFT JOIN FORMATO frm ON frm.ID_FORMATO = f.ID_FORMATO
      WHERE ${where.join(' AND ')}
      ORDER BY f.FECHA, f.ID_SALA, f.HORA_INICIO
    `;
    const r = await cn.execute(sql, bind, OUT_OBJ);
    res.json(r.rows || []);
  } catch (e) {
    console.error('GET /api/empleado/cartelera/:peliculaId/funciones ->', e);
    res.status(500).json({ message: 'Error al obtener funciones' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};


/* ===================== ASIENTOS ===================== */
exports.getAsientosByFuncion = async (req, res) => {
  let cn;
  try {
    const { funcionId } = req.params;
    cn = await db.getConnection();

    const r = await cn.execute(
      `
      SELECT
        fa.ID_FA          AS "idFa",
        a.FILA            AS "fila",
        a.COLUMNA         AS "columna",
        a.TIPO            AS "tipo",
        fa.ESTADO         AS "estado",
        fa.BLOQUEADO_HASTA AS "bloqueado_hasta"
      FROM FUNCION_ASIENTO fa
      JOIN ASIENTOS a ON a.ID_ASIENTO = fa.ID_ASIENTO
      WHERE fa.ID_FUNCION = :id
      ORDER BY a.FILA, a.COLUMNA
      `,
      { id: Number(funcionId) },
      OUT_OBJ
    );

    res.json(r.rows || []);
  } catch (e) {
    console.error('GET /api/empleado/funciones/:funcionId/asientos ->', e);
    res.status(500).json({ message: 'Error al obtener asientos' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/* ===================== VENDER ===================== */
exports.postVender = async (req, res) => {
  let cn;
  try {
    const { funcionId } = req.params;
    const { asientos = [], idemKey = null, cliente = null, metodoPago = null } = req.body;
    const metodo = String(metodoPago || 'EFECTIVO').toUpperCase();
    const MET = ['EFECTIVO','TARJETA','PAYPAL'].includes(metodo) ? metodo : 'EFECTIVO';

    if (!Array.isArray(asientos) || asientos.length === 0) {
      return res.status(400).json({ message: 'Debes enviar asientos[]' });
    }

    cn = await db.getConnection();
    // Comenzamos transacción explícita
    await cn.execute(`BEGIN NULL; END;`);

    // 1) Identificar cuáles de los ID_FA vienen de una RESERVA
    const bind = { fun: Number(funcionId) };
    const inFa = bindList('fa', asientos, bind).join(','); // :fa0,:fa1,...
    const qRes = await cn.execute(
      `
      SELECT e.ID_FA     AS "idFa",
             e.ID_COMPRA AS "compraId"
        FROM ENTRADAS e
        JOIN COMPRAS  c ON c.ID_COMPRA = e.ID_COMPRA
       WHERE c.ID_FUNCION = :fun
         AND e.ID_FA IN (${inFa})
         AND e.ESTADO = 'RESERVADA'
      `,
      bind,
      OUT_OBJ
    );
    const reservadosRows = qRes.rows || [];
    const reservadosSet = new Set(reservadosRows.map(r => Number(r.idFa)));
    const aReservados = asientos.filter(x => reservadosSet.has(Number(x)));
    const aNuevos     = asientos.filter(x => !reservadosSet.has(Number(x)));

    // 2) CONFIRMAR RESERVAS -> ENTRADAS: RESERVADA -> EMITIDA (asigna QR)
    let confirmedFromRes = 0;
    if (aReservados.length > 0) {
      const b1 = { fun: Number(funcionId) };
      const in1 = bindList('r', aReservados, b1).join(',');
      // FUNCION_ASIENTO: RESERVADO -> VENDIDO
      const updFaRes = await cn.execute(
        `UPDATE FUNCION_ASIENTO
            SET ESTADO='VENDIDO', BLOQUEADO_HASTA=NULL
          WHERE ID_FUNCION=:fun
            AND ID_FA IN (${in1})
            AND ESTADO='RESERVADO'`,
        b1,
        { autoCommit: false }
      );
      confirmedFromRes = updFaRes.rowsAffected || 0;

      // ENTRADAS: RESERVADA -> EMITIDA (+ QR)
      for (const idFa of aReservados) {
        await cn.execute(
          `UPDATE ENTRADAS
              SET ESTADO='EMITIDA',
                  CODIGO_QR=:qr
            WHERE ID_FA=:fa
              AND ID_COMPRA IN (
                SELECT ID_COMPRA FROM COMPRAS WHERE ID_FUNCION=:fun
              )
              AND ESTADO='RESERVADA'`,
          { qr: crypto.randomUUID(), fa: Number(idFa), fun: Number(funcionId) },
          { autoCommit: false }
        );
      }

      // Para cada compra afectada, si TODAS sus entradas ya están EMITIDAS -> COMPRAS := PAGADA
      const comprasAfectadas = Array.from(new Set(reservadosRows.map(r => Number(r.compraId))));
      for (const cId of comprasAfectadas) {
        const rPend = await cn.execute(
          `SELECT COUNT(*) AS "pend"
             FROM ENTRADAS
            WHERE ID_COMPRA=:c
              AND ESTADO='RESERVADA'`,
          { c: cId },
          OUT_OBJ
        );
        const quedan = Number(rPend.rows?.[0]?.pend || 0);
        if (quedan === 0) {
        await cn.execute(
            `UPDATE COMPRAS
                SET ESTADO='PAGADA',
                    METODO_PAGO=:met
              WHERE ID_COMPRA=:c`,
            { c: cId, met: MET },
            { autoCommit: false }
          );
        }
      }
    }

    // 3) VENTA NUEVA EN TAQUILLA (DISPONIBLES) -> crear COMPRAS + ENTRADAS
    let vendidosNuevos = 0;
    let compraIdNueva = null;

    if (aNuevos.length > 0) {
      // (a) Marcar asientos como VENDIDO (solo si están disponibles o bloqueados vencidos)
      const b2 = { fun: Number(funcionId) };
      const in2 = bindList('n', aNuevos, b2).join(',');
      const updFaNew = await cn.execute(
        `UPDATE FUNCION_ASIENTO
            SET ESTADO='VENDIDO', BLOQUEADO_HASTA=NULL
          WHERE ID_FUNCION=:fun
            AND ID_FA IN (${in2})
            AND (
              ESTADO='DISPONIBLE'
              OR (ESTADO='BLOQUEADO' AND (BLOQUEADO_HASTA IS NULL OR BLOQUEADO_HASTA <= SYSTIMESTAMP))
            )`,
        b2,
        { autoCommit: false }
      );
      vendidosNuevos = updFaNew.rowsAffected || 0;
      if (vendidosNuevos < aNuevos.length) {
        // Alguno no estaba disponible -> conflicto
        await cn.rollback();
        return res.status(409).json({ message: 'Uno o más asientos ya no están disponibles.' });
      }

      // (b) Cliente de mostrador + COMPRAS + ENTRADAS (EMITIDA) + QR
      const precioUnit = await getFuncionPrecio(cn, funcionId);
      const total = precioUnit * aNuevos.length;

      const idCliente = await ensureWalkinClient(cn, cliente || {});
      const rComp = await cn.execute(
        `INSERT INTO COMPRAS(
           ID_CLIENTE, ID_FUNCION, MONTO_TOTAL, ESTADO, METODO_PAGO, IDEMPOTENCY_KEY
         ) VALUES (
           :cli, :fun, :tot, 'PAGADA', :met, :idem
         ) RETURNING ID_COMPRA INTO :id`,
        {
          cli: idCliente,
          fun: Number(funcionId),
          tot: total,
           met: MET,
          idem: idemKey || null,
          id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        },
        { autoCommit: false }
      );
      compraIdNueva = Number(rComp.outBinds.id[0]);

      for (const idFa of aNuevos) {
        await cn.execute(
          `INSERT INTO ENTRADAS(
             ID_COMPRA, ID_FA, PRECIO, ESTADO, CODIGO_QR
           ) VALUES (
             :c, :fa, :p, 'EMITIDA', :qr
           )`,
          { c: compraIdNueva, fa: Number(idFa), p: precioUnit, qr: crypto.randomUUID() },
          { autoCommit: false }
        );
      }
    }

    await cn.commit();

    res.json({
      ok: true,
      funcionId: Number(funcionId),
      vendidosNuevos,
      confirmadosDesdeReserva: confirmedFromRes,
      compraIdNueva,
    });
  } catch (e) {
    try { if (cn) await cn.rollback(); } catch {}
    console.error('POST /api/empleado/funciones/:funcionId/vender ->', e);
    res.status(500).json({ message: e?.message || 'Error al procesar la venta' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

// src/controllers/empleado.controller.js
exports.postLiberarReservasVencidas = async (req, res) => {
  let cn;
  try {
    const { funcionId } = req.params;
    cn = await db.getConnection();

    const upd = await cn.execute(
      `
      UPDATE FUNCION_ASIENTO
         SET ESTADO = 'DISPONIBLE',
             BLOQUEADO_HASTA = NULL
       WHERE ID_FUNCION = :funcionId
         AND ESTADO = 'RESERVADO'
         AND BLOQUEADO_HASTA IS NOT NULL
         AND BLOQUEADO_HASTA <= SYSTIMESTAMP
      `,
      { funcionId: Number(funcionId) },
      { autoCommit: true }
    );

    res.json({ ok: true, released: upd.rowsAffected || 0 });
  } catch (e) {
    console.error('POST /api/empleado/funciones/:funcionId/liberar-reservas-vencidas ->', e);
    res.status(500).json({ message: 'Error al liberar reservas vencidas' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};
