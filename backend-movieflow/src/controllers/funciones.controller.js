// controllers/funciones.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');

const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/* ───────────────────────── Helpers ───────────────────────── */

/** ¿la función ya tiene ventas registradas? */
async function funcionTieneVentas(cn, idFuncion) {
  // Por compras pagadas/confirmadas
  const c1 = await cn.execute(
    `SELECT COUNT(*) AS "T"
       FROM COMPRAS c
      WHERE c.ID_FUNCION = :id
        AND c.ESTADO IN ('PAGADA','CONFIRMADA')`,
    { id: Number(idFuncion) },
    OUT_OBJ
  );

  // Por entradas emitidas (cualquier ticket generado)
  const c2 = await cn.execute(
    `SELECT COUNT(*) AS "T"
       FROM ENTRADAS e
       JOIN FUNCION_ASIENTO fa ON fa.ID_FA = e.ID_FA
      WHERE fa.ID_FUNCION = :id`,
    { id: Number(idFuncion) },
    OUT_OBJ
  );

  return (Number(c1.rows?.[0]?.T || 0) + Number(c2.rows?.[0]?.T || 0)) > 0;
}

/** Marca como FINALIZADA toda función ACTIVA que ya pasó su hora final (respeta overnight). */
async function finalizarFuncionesVencidas(cn) {
  await cn.execute(
    `
    UPDATE FUNCIONES f
       SET ESTADO = 'FINALIZADA'
     WHERE f.ESTADO = 'ACTIVA'
       AND (
         CAST(f.FECHA AS TIMESTAMP)
         + f.HORA_FINAL
         + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                THEN INTERVAL '1' DAY ELSE INTERVAL '0' DAY END
       ) <= SYSTIMESTAMP
    `,
    [],
    { autoCommit: true }
  );
}

/** Clona el plano de asientos de la sala hacia FUNCION_ASIENTO para una función dada. */
async function clonarMapaAsientosDeSala(cn, idFuncion, idSala) {
  await cn.execute(
    `DELETE FROM FUNCION_ASIENTO WHERE ID_FUNCION = :f`,
    { f: idFuncion },
    { autoCommit: false }
  );

  await cn.execute(
    `INSERT INTO FUNCION_ASIENTO (ID_FUNCION, ID_ASIENTO, ESTADO, CREADO_EN)
      SELECT :f, a.ID_ASIENTO, 'DISPONIBLE', SYSTIMESTAMP
        FROM ASIENTOS a
       WHERE a.ID_SALA = :s
         AND a.ACTIVO = 'S'`,
    { f: idFuncion, s: idSala },
    { autoCommit: false }
  );
}

/** Valida solape contra eventos (nueva tabla EVENTOS_ESPECIALES y legacy EVENTOS_RESERVADOS). */
async function existeSolapeConEventos(cn, { salaId, fecha, iniMin, finAdj }) {
  const binds = { salaId: Number(salaId), fecha, iniMin, finAdj };
  let total = 0;

  // a) EVENTOS_ESPECIALES (START_TS/END_TS) – intenta sin y con esquema ESTUDIANTE
  const qEsp = (tabla) => `
    SELECT COUNT(1) AS "T"
      FROM ${tabla} E
     WHERE E.SALA_ID = :salaId
       AND UPPER(TRIM(NVL(E.ESTADO,'RESERVADO'))) NOT LIKE 'CANCEL%'
       AND NOT (
             E.END_TS   <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
         OR  E.START_TS >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
       )
  `;
  try {
    const r1 = await cn.execute(qEsp('EVENTOS_ESPECIALES'), binds, OUT_OBJ);
    total += Number(r1.rows?.[0]?.T || 0);
  } catch (e1) {
    if (String(e1.message).includes('ORA-00942') || String(e1.message).includes('ORA-00904')) {
      const r1b = await cn.execute(qEsp('ESTUDIANTE.EVENTOS_ESPECIALES'), binds, OUT_OBJ);
      total += Number(r1b.rows?.[0]?.T || 0);
    } else {
      throw e1;
    }
  }

  // b) EVENTOS_RESERVADOS (legacy FECHA/HORA_*)
  const qLegacy = `
    WITH EV AS (
      SELECT
        er.FECHA AS FECHA,
        UPPER(TRIM(NVL(er.ESTADO,'RESERVADO'))) AS ESTADO,
        (TO_NUMBER(SUBSTR(er.HORA_INICIO,1,2))*60 + TO_NUMBER(SUBSTR(er.HORA_INICIO,4,2))) AS iniMin,
        (TO_NUMBER(SUBSTR(er.HORA_FINAL ,1,2))*60 + TO_NUMBER(SUBSTR(er.HORA_FINAL ,4,2))) AS finMin
      FROM EVENTOS_RESERVADOS er
     WHERE er.SALA_ID = :salaId
       AND er.FECHA   = TO_DATE(:fecha,'YYYY-MM-DD')
    )
    SELECT COUNT(*) AS "T"
      FROM EV
     WHERE ESTADO NOT LIKE 'CANCEL%'
       AND NOT (
         (FECHA + NUMTODSINTERVAL(CASE WHEN finMin <= :iniMin THEN finMin + 1440 ELSE finMin END,'MINUTE'))
           <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
         OR
         (FECHA + NUMTODSINTERVAL(iniMin,'MINUTE'))
           >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
       )
  `;
  const r2 = await cn.execute(qLegacy, { salaId: Number(salaId), fecha, iniMin, finAdj }, OUT_OBJ);
  total += Number(r2.rows?.[0]?.T || 0);

  return total > 0;
}

/* ───────────────────────── Endpoints ───────────────────────── */

/** GET /api/funciones/select-data */
exports.getSelectData = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    const [pelis, salas, formatos, idiomas] = await Promise.all([
      cn.execute(
        `SELECT
           ID_PELICULA       AS "id",
           TITULO            AS "titulo",
           DURACION_MINUTOS  AS "duracion"
         FROM PELICULA
        WHERE ESTADO = 'ACTIVA'
      ORDER BY TITULO`,
        [],
        OUT_OBJ
      ),
      cn.execute(
        `SELECT ID_SALA AS "id", NOMBRE AS "nombre", CAPACIDAD AS "capacidad"
           FROM SALAS
          WHERE ESTADO = 'ACTIVA'
       ORDER BY NOMBRE`,
        [],
        OUT_OBJ
      ),
      cn.execute(
        `SELECT ID_FORMATO AS "id", NOMBRE AS "nombre"
           FROM FORMATO
       ORDER BY NOMBRE`,
        [],
        OUT_OBJ
      ),
      cn.execute(
        `SELECT ID_IDIOMA AS "id", NOMBRE AS "nombre"
           FROM IDIOMAS
       ORDER BY NOMBRE`,
        [],
        OUT_OBJ
      ),
    ]);

    res.json({
      peliculas: pelis.rows || [],
      salas: salas.rows || [],
      formatos: formatos.rows || [],
      idiomas: idiomas.rows || [],
    });
  } catch (err) {
    console.error('GET /api/funciones/select-data ->', err);
    res.status(500).json({ message: 'Error al obtener catálogos' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** GET /api/funciones?fecha=YYYY-MM-DD (opcional) */
exports.listarFunciones = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    await finalizarFuncionesVencidas(cn);

    const fecha = (req.query.fecha || '').trim();
    const where = [`f.ESTADO = 'ACTIVA'`];  // solo funciones activas
    const bind  = {};
    if (fecha) {
      where.push(`f.FECHA = TO_DATE(:fecha,'YYYY-MM-DD')`);
      bind.fecha = fecha;
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT
        f.ID_FUNCION AS "id",
        f.ID_PELICULA AS "peliculaId",
        f.ID_SALA     AS "salaId",
        f.ID_FORMATO  AS "formatoId",
        f.ID_IDIOMA   AS "idiomaId",

        TO_CHAR(f.FECHA,'YYYY-MM-DD') AS "fecha",
        TO_CHAR(f.FECHA + f.HORA_INICIO,'HH24:MI') AS "horaInicio",
        TO_CHAR(
          f.FECHA + f.HORA_FINAL
          + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                  THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END,
          'HH24:MI'
        ) AS "horaFinal",
        CASE WHEN f.HORA_FINAL <= f.HORA_INICIO THEN 1 ELSE 0 END AS "overnight",

        f.PRECIO AS "precio",

        p.TITULO AS "peliculaTitulo",
        CASE WHEN p.IMAGEN_URL IS NULL THEN NULL
             ELSE DBMS_LOB.SUBSTR(p.IMAGEN_URL, 4000, 1) END AS "imagenUrl",

        fo.NOMBRE AS "formato",
        i.NOMBRE  AS "idioma"
      FROM FUNCIONES f
      JOIN PELICULA p ON p.ID_PELICULA = f.ID_PELICULA
      JOIN FORMATO fo ON fo.ID_FORMATO = f.ID_FORMATO
      JOIN IDIOMAS i  ON i.ID_IDIOMA   = f.ID_IDIOMA
      ${whereSql}
      ORDER BY f.FECHA, f.ID_SALA, f.HORA_INICIO
    `;
    const r = await cn.execute(sql, bind, OUT_OBJ);
    res.json(r.rows);
  } catch (e) {
    console.error('listar funciones ->', e);
    res.status(500).json({ message: 'Error al listar funciones' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** POST /api/funciones */
exports.crearFuncion = async (req, res) => {
  let cn;
  try {
    const { id_pelicula, id_sala, id_formato, id_idioma, fecha, horaInicio, horaFinal, precio } = req.body;
    if (!id_pelicula || !id_sala || !id_formato || !id_idioma || !fecha || !horaInicio || !horaFinal) {
      return res.status(400).json({ message: 'Faltan campos' });
    }

    const iniMin = toMinutes(horaInicio);
    const finMin = toMinutes(horaFinal);
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin; // overnight
    const dur = finAdj - iniMin;
    if (dur <= 0 || dur > 1440) return res.status(400).json({ message: 'Duración inválida' });

    cn = await db.getConnection();

    // Solape con funciones activas
    const newStart = `(TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))`;
    const newEnd   = `(TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))`;

    const solape = await cn.execute(
      `
      SELECT COUNT(*) AS "T"
        FROM FUNCIONES f
       WHERE f.ID_SALA = :id_sala
         AND f.ESTADO  = 'ACTIVA'
         AND NOT (
           (f.FECHA + f.HORA_FINAL
              + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                     THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
             <= ${newStart}
           OR
           (f.FECHA + f.HORA_INICIO) >= ${newEnd}
         )
         AND f.FECHA = TO_DATE(:fecha,'YYYY-MM-DD')
      `,
      { id_sala: Number(id_sala), fecha, iniMin, finAdj },
      OUT_OBJ
    );
    if (solape.rows[0].T > 0) {
      return res.status(409).json({ message: 'La sala ya tiene una función que se solapa en ese horario' });
    }

    // Solape con eventos (nuevos y legacy)
    const chocaEvento = await existeSolapeConEventos(cn, { salaId: id_sala, fecha, iniMin, finAdj });
    if (chocaEvento) {
      return res.status(409).json({ message: 'La sala tiene un evento reservado que se solapa en ese horario' });
    }

    // Insert
    const r = await cn.execute(
      `INSERT INTO FUNCIONES (
         ID_PELICULA, ID_SALA, ID_FORMATO, ID_IDIOMA,
         FECHA, HORA_INICIO, HORA_FINAL, PRECIO
       ) VALUES (
         :id_pelicula, :id_sala, :id_formato, :id_idioma,
         TO_DATE(:fecha,'YYYY-MM-DD'),
         NUMTODSINTERVAL(:iniMin,'MINUTE'),
         NUMTODSINTERVAL(:finMin,'MINUTE'),
         :precio
       )
       RETURNING ID_FUNCION INTO :outId`,
      {
        id_pelicula: Number(id_pelicula),
        id_sala: Number(id_sala),
        id_formato: Number(id_formato),
        id_idioma: Number(id_idioma),
        fecha,
        iniMin, finMin,
        precio: Number(precio),
        outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: false }
    );

    const newId = r.outBinds.outId[0];

    // clonar plano de la sala a FUNCION_ASIENTO
    await clonarMapaAsientosDeSala(cn, newId, Number(id_sala));

    await cn.commit();

    res.status(201).json({
      id: newId,
      id_pelicula: Number(id_pelicula),
      id_sala: Number(id_sala),
      id_formato: Number(id_formato),
      id_idioma: Number(id_idioma),
      fecha,
      hora_inicio: horaInicio,
      hora_final: horaFinal,
      precio: Number(precio)
    });
  } catch (e) {
    try { if (cn) await cn.rollback(); } catch {}
    console.error('crearFuncion', e);
    res.status(500).json({ message: 'Error al crear función' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

exports.crearFuncionesMasivas = async (req, res) => {
  let cn;
  try {
    const {
      id_pelicula, id_sala, id_formato, id_idioma,
      fechas,             // ['YYYY-MM-DD', ...]
      horaInicio, horaFinal,
      precio,
      allOrNothing = false
    } = req.body;

    if (!id_pelicula || !id_sala || !id_formato || !id_idioma)
      return res.status(400).json({ message: 'Faltan campos' });
    if (!Array.isArray(fechas) || !fechas.length)
      return res.status(400).json({ message: 'Debes enviar al menos una fecha' });
    if (!horaInicio || !horaFinal)
      return res.status(400).json({ message: 'Fecha(s) y horas son obligatorias' });

    const iniMin = toMinutes(horaInicio);
    const finMin = toMinutes(horaFinal);
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin; // overnight
    const dur = finAdj - iniMin;
    if (dur <= 0 || dur > 1440) return res.status(400).json({ message: 'Duración inválida' });

    if (fechas.length > 200) {
      return res.status(413).json({ message: 'Demasiadas fechas (máx 200 por lote)' });
    }

    cn = await db.getConnection();
    await cn.execute('BEGIN NULL; END;'); // abre tx

    const OK = [];
    const CONFLICTOS = [];
    const ERRORES = [];

    for (const fecha of fechas) {
      try {
        // Funciones activas solapadas
        const solape = await cn.execute(
          `
          SELECT COUNT(*) AS "T"
            FROM FUNCIONES f
           WHERE f.ID_SALA = :id_sala
             AND f.FECHA   = TO_DATE(:fecha,'YYYY-MM-DD')
             AND f.ESTADO  = 'ACTIVA'
             AND NOT (
               (f.FECHA + f.HORA_FINAL
                  + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                         THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
                 <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
               OR
               (f.FECHA + f.HORA_INICIO)
                 >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
             )
          `,
          { id_sala: Number(id_sala), fecha, iniMin, finAdj },
          OUT_OBJ
        );

        if (solape.rows[0].T > 0) {
          CONFLICTOS.push({ fecha, reason: 'solape' });
          if (allOrNothing) {
            await cn.rollback();
            return res.status(409).json({ created: [], conflicts: CONFLICTOS, errors: ERRORES, message: 'Conflictos detectados (allOrNothing)' });
          }
          continue;
        }

        // Eventos solapados (nuevos y legacy)
        const chocaEvento = await existeSolapeConEventos(cn, { salaId: id_sala, fecha, iniMin, finAdj });
        if (chocaEvento) {
          CONFLICTOS.push({ fecha, reason: 'solape_evento' });
          if (allOrNothing) {
            await cn.rollback();
            return res.status(409).json({ created: [], conflicts: CONFLICTOS, errors: ERRORES, message: 'Conflictos (evento reservado)' });
          }
          continue;
        }

        // Insert
        const r = await cn.execute(
          `
          INSERT INTO FUNCIONES (
            ID_PELICULA, ID_SALA, ID_FORMATO, ID_IDIOMA,
            FECHA, HORA_INICIO, HORA_FINAL, PRECIO
          ) VALUES (
            :id_pelicula, :id_sala, :id_formato, :id_idioma,
            TO_DATE(:fecha,'YYYY-MM-DD'),
            NUMTODSINTERVAL(:iniMin,'MINUTE'),
            NUMTODSINTERVAL(:finMin,'MINUTE'),
            :precio
          )
          RETURNING ID_FUNCION INTO :outId
          `,
          {
            id_pelicula: Number(id_pelicula),
            id_sala: Number(id_sala),
            id_formato: Number(id_formato),
            id_idioma: Number(id_idioma),
            fecha,
            iniMin, finMin,
            precio: Number(precio),
            outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
          },
          { autoCommit: false }
        );

        const newId = r.outBinds.outId[0];
        OK.push({ fecha, id: newId });

        await clonarMapaAsientosDeSala(cn, newId, Number(id_sala));
      } catch (e) {
        ERRORES.push({ fecha, reason: e?.message || 'error' });
        if (allOrNothing) {
          await cn.rollback();
          return res.status(500).json({ created: [], conflicts: CONFLICTOS, errors: ERRORES, message: 'Error durante la inserción (allOrNothing)' });
        }
      }
    }

    await cn.commit();

    return res.status(200).json({
      created: OK,
      conflicts: CONFLICTOS,
      errors: ERRORES
    });
  } catch (e) {
    console.error('crear funciones masivas ->', e);
    try { if (cn) await cn.rollback(); } catch {}
    res.status(500).json({ message: 'Error al crear funciones masivas' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** DELETE /api/funciones/:id */
exports.eliminarFuncion = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const id = Number(req.params.id);

    // Si tiene ventas, no permitir cancelación
    if (await funcionTieneVentas(cn, id)) {
      return res.status(409).json({ message: 'No se puede cancelar: la función ya tiene tickets vendidos' });
    }

    const r = await cn.execute(
      `UPDATE FUNCIONES SET ESTADO = 'CANCELADA'
        WHERE ID_FUNCION = :id AND ESTADO = 'ACTIVA'`,
      { id },
      { autoCommit: true }
    );
    res.json({ ok: true, updated: r.rowsAffected });
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar función' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** PUT /api/funciones/:id */
exports.actualizarFuncion = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { id_pelicula, id_sala, id_formato, id_idioma, fecha, horaInicio, horaFinal, precio } = req.body;

    if (!id || !id_pelicula || !id_sala || !id_formato || !id_idioma)
      return res.status(400).json({ message: 'Faltan campos' });
    if (!fecha || !horaInicio || !horaFinal)
      return res.status(400).json({ message: 'Fecha y horas son obligatorias' });

    const iniMin = toMinutes(horaInicio);
    const finMin = toMinutes(horaFinal);
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin; // overnight
    const dur = finAdj - iniMin;
    if (dur <= 0 || dur > 1440) return res.status(400).json({ message: 'Duración inválida' });

    cn = await db.getConnection();

    // Si tiene ventas, no permitir edición
    if (await funcionTieneVentas(cn, id)) {
      return res.status(409).json({ message: 'No se puede editar: la función ya tiene tickets vendidos' });
    }

    // Solape con otras funciones (excluyendo esta)
    const solape = await cn.execute(
      `
      SELECT COUNT(*) AS "T"
        FROM FUNCIONES f
       WHERE f.ID_SALA = :id_sala
         AND f.FECHA   = TO_DATE(:fecha,'YYYY-MM-DD')
         AND f.ID_FUNCION <> :id
         AND f.ESTADO  = 'ACTIVA'
         AND NOT (
           (f.FECHA + f.HORA_FINAL
              + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                     THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
             <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
           OR
           (f.FECHA + f.HORA_INICIO)
             >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
         )
      `,
      { id, id_sala: Number(id_sala), fecha, iniMin, finAdj },
      OUT_OBJ
    );
    if (solape.rows[0].T > 0)
      return res.status(409).json({ message: 'La sala ya tiene una función que se solapa en ese horario' });

    // Solape con eventos (nuevos y legacy)
    const chocaEvento = await existeSolapeConEventos(cn, { salaId: id_sala, fecha, iniMin, finAdj });
    if (chocaEvento) {
      return res.status(409).json({ message: 'La sala tiene un evento reservado que se solapa en ese horario' });
    }

    // Saber si cambió la sala para re-clonar plano
    const prev = await cn.execute(
      `SELECT ID_SALA FROM FUNCIONES WHERE ID_FUNCION = :id`,
      { id },
      OUT_OBJ
    );
    const salaAnterior = Number(prev.rows?.[0]?.ID_SALA);

    // Update
    await cn.execute(
      `UPDATE FUNCIONES
          SET ID_PELICULA=:id_pelicula, ID_SALA=:id_sala, ID_FORMATO=:id_formato, ID_IDIOMA=:id_idioma,
              FECHA=TO_DATE(:fecha,'YYYY-MM-DD'),
              HORA_INICIO=NUMTODSINTERVAL(:iniMin,'MINUTE'),
              HORA_FINAL =NUMTODSINTERVAL(:finMin,'MINUTE'),
              PRECIO=:precio
        WHERE ID_FUNCION=:id`,
      {
        id,
        id_pelicula: Number(id_pelicula),
        id_sala: Number(id_sala),
        id_formato: Number(id_formato),
        id_idioma: Number(id_idioma),
        fecha,
        iniMin,
        finMin,
        precio: Number(precio)
      },
      { autoCommit: false }
    );

    // Si cambió la sala, re-clonar plano
    if (salaAnterior !== Number(id_sala)) {
      await clonarMapaAsientosDeSala(cn, id, Number(id_sala));
    }

    await cn.commit();
    res.json({ ok: true });
  } catch (e) {
    console.error('actualizar función ->', e);
    res.status(500).json({ message: 'Error al actualizar función' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** POST /api/funciones/finalizar-sweep */
exports.finalizarSweep = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const r = await cn.execute(
      `
      UPDATE FUNCIONES f
         SET ESTADO = 'FINALIZADA'
       WHERE f.ESTADO = 'ACTIVA'
         AND (
           CAST(f.FECHA AS TIMESTAMP)
           + f.HORA_FINAL
           + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                  THEN INTERVAL '1' DAY ELSE INTERVAL '0' DAY END
         ) <= SYSTIMESTAMP
      `,
      [],
      { autoCommit: true }
    );
    res.json({ updated: r.rowsAffected || 0 });
  } catch (e) {
    console.error('finalizar-sweep ->', e);
    res.status(500).json({ message: 'Error al finalizar funciones' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** GET /api/funciones/:id/asientos */
exports.asientosDeFuncion = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    cn = await db.getConnection();
    const r = await cn.execute(
      `SELECT
         a.FILA             AS "fila",
         a.COLUMNA          AS "columna",
         a.TIPO             AS "tipo",       -- NORMAL | PMR | DISABLED
         fa.ESTADO          AS "estado",     -- DISPONIBLE | RESERVADO | BLOQUEADO
         fa.BLOQUEADO_HASTA AS "bloqueado_hasta"
        FROM FUNCION_ASIENTO fa
        JOIN ASIENTOS a ON a.ID_ASIENTO = fa.ID_ASIENTO
       WHERE fa.ID_FUNCION = :id`,
      { id },
      OUT_OBJ
    );
    res.json(r.rows || []);
  } catch (e) {
    console.error('asientosDeFuncion', e);
    res.status(500).json({ message: 'Error al obtener asientos' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** GET /api/funciones/:id/has-ventas */
exports.hasVentas = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const id = Number(req.params.id);
    const has = await funcionTieneVentas(cn, id);
    res.json({ hasVentas: has });
  } catch (e) {
    res.status(500).json({ message: 'Error al verificar ventas' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};
