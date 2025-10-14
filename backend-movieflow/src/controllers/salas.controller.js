// src/controllers/salas.controller.js
const oracledb = require('oracledb');
const db = require('../config/db');
const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// GET /api/salas  -> lista ACT/INACT con conteo de funciones activas
exports.listarSalas = async (_req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT
         S.ID_SALA   AS "id",
         S.NOMBRE    AS "nombre",
         S.CAPACIDAD AS "capacidad",
         S.ESTADO    AS "estado",
         (SELECT COUNT(*) FROM FUNCIONES F
           WHERE F.ID_SALA = S.ID_SALA
             AND F.ESTADO = 'ACTIVA') AS "funcionesActivas"
       FROM SALAS S
       ORDER BY S.NOMBRE`,
      {},
      OUT_OBJ
    );
    res.json(rs.rows || []);
  } catch (e) {
    console.error('listarSalas', e);
    res.status(500).json({ message: 'Error al listar salas' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};


// POST /api/salas  -> crea ACTIVA por defecto
exports.crearSala = async (req, res) => {
  let cn;
  try {
    const { nombre, capacidad } = req.body;
    if (!nombre || Number(capacidad) <= 0)
      return res.status(400).json({ message: 'Nombre y capacidad válidos requeridos' });

    cn = await db.getConnection();

    const dup = await cn.execute(
      `SELECT COUNT(*) AS T FROM SALAS WHERE UPPER(NOMBRE)=UPPER(:n)`,
      { n: nombre }, OUT_OBJ
    );
    if (dup.rows[0].T > 0)
      return res.status(409).json({ message: 'Ya existe una sala con ese nombre' });

    const r = await cn.execute(
      `INSERT INTO SALAS (NOMBRE, CAPACIDAD, ESTADO)
       VALUES (:n, :c, 'ACTIVA')
       RETURNING ID_SALA INTO :outId`,
      { n: nombre, c: Number(capacidad), outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true }
    );
    res.status(201).json({ id: r.outBinds.outId[0], nombre, capacidad: Number(capacidad), estado: 'ACTIVA' });
  } catch (e) {
    console.error('crearSala', e);
    res.status(500).json({ message: 'Error al crear sala' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};

// PUT /api/salas/:id  -> editar nombre/estado (capacidad NO se toca aquí)
exports.actualizarSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { nombre } = req.body;
    let { estado } = req.body;

    if (!id || !nombre) {
      return res.status(400).json({ message: 'Datos inválidos' });
    }

    estado = String(estado || 'ACTIVA').toUpperCase();
    if (!['ACTIVA', 'INACTIVA'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

    cn = await db.getConnection();

    // Validar que exista y traer capacidad actual para retornarla
    const cur = await cn.execute(
      `SELECT CAPACIDAD FROM SALAS WHERE ID_SALA=:id`,
      { id },
      OUT_OBJ
    );
    if (!cur.rows?.length) {
      return res.status(404).json({ message: 'Sala no encontrada' });
    }
    const capacidadActual = Number(cur.rows[0].CAPACIDAD);

    // Duplicado de nombre
    const dup = await cn.execute(
      `SELECT COUNT(*) AS T
         FROM SALAS
        WHERE UPPER(NOMBRE)=UPPER(:n) AND ID_SALA<>:id`,
      { n: nombre, id }, OUT_OBJ
    );
    if (dup.rows[0].T > 0) {
      return res.status(409).json({ message: 'Ya existe una sala con ese nombre' });
    }

    // Si intenta INACTIVAR, validar dependencias
    if (estado === 'INACTIVA') {
      const depFun = await cn.execute(
        `SELECT COUNT(*) AS T FROM FUNCIONES WHERE ID_SALA=:id AND ESTADO='ACTIVA'`,
        { id }, OUT_OBJ
      );
      if (depFun.rows[0].T > 0) {
        return res.status(409).json({ message: 'No se puede inactivar: la sala tiene funciones activas.' });
      }
      const depEve = await cn.execute(
        `SELECT COUNT(*) AS T FROM EVENTOS_RESERVADOS WHERE SALA_ID=:id AND ESTADO='RESERVADO'`,
        { id }, OUT_OBJ
      );
      if (depEve.rows[0].T > 0) {
        return res.status(409).json({ message: 'No se puede inactivar: la sala tiene eventos reservados.' });
      }
    }

    // Actualiza SOLO nombre y estado
    await cn.execute(
      `UPDATE SALAS SET NOMBRE=:n, ESTADO=:e WHERE ID_SALA=:id`,
      { n: nombre, e: estado, id },
      { autoCommit: true }
    );

    res.json({ id, nombre, capacidad: capacidadActual, estado });
  } catch (e) {
    console.error('actualizarSala', e);
    res.status(500).json({ message: 'Error al actualizar sala' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};


// DELETE /api/salas/:id  -> hard delete (bloquea si tiene funciones)
exports.eliminarSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    cn = await db.getConnection();

    const dep = await cn.execute(
      `SELECT COUNT(*) AS T FROM FUNCIONES WHERE ID_SALA=:id`,
      { id }, OUT_OBJ
    );
    if (dep.rows[0].T > 0)
      return res.status(409).json({ message: 'No se puede eliminar: la sala tiene funciones asignadas' });

    await cn.execute(`DELETE FROM SALAS WHERE ID_SALA=:id`, { id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (e) {
    console.error('eliminarSala', e);
    res.status(500).json({ message: 'Error al eliminar sala' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};

// controllers/salas.controller.js
exports.generarAsientosSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { filas, columnas, primeraFila = 'A', override = false } = req.body || {};
    if (!id || !Number.isFinite(filas) || !Number.isFinite(columnas) || filas <= 0 || columnas <= 0) {
      return res.status(400).json({ message: 'Parámetros inválidos (filas/columnas deben ser > 0)' });
    }
    const startChar = String(primeraFila || 'A').trim().charAt(0).toUpperCase();
    const startOrd = startChar.charCodeAt(0);
    if (startOrd < 65 || startOrd > 90) {
      return res.status(400).json({ message: 'primeraFila debe ser una letra A-Z' });
    }
    if (filas > 26) {
      return res.status(400).json({ message: 'Por ahora se permite máximo 26 filas (A-Z)' });
    }

    cn = await db.getConnection();

    // Verifica existencia de la sala
    const sala = await cn.execute(`SELECT COUNT(*) AS T FROM SALAS WHERE ID_SALA=:id`, { id }, OUT_OBJ);
    if (sala.rows[0].T === 0) return res.status(404).json({ message: 'Sala no encontrada' });

    // Si ya existen asientos y no se desea reemplazar, bloquea
    const ya = await cn.execute(`SELECT COUNT(*) AS T FROM ASIENTOS WHERE ID_SALA=:id`, { id }, OUT_OBJ);
    if (ya.rows[0].T > 0 && !override) {
      return res.status(409).json({ message: 'La sala ya tiene asientos. Activa "Reemplazar" para regenerarlos.' });
    }

    // PL/SQL: borra si override y genera NxM asientos
    await cn.execute(
      `
      DECLARE
        v_sala    NUMBER := :id_sala;
        v_filas   NUMBER := :filas;
        v_cols    NUMBER := :cols;
        v_start   NUMBER := :startOrd; -- 65 = 'A'
        v_row     VARCHAR2(10);
      BEGIN
        IF :do_delete = 1 THEN
          DELETE FROM ASIENTOS WHERE ID_SALA = v_sala;
        END IF;

        FOR r IN 1..v_filas LOOP
          v_row := CHR(v_start + r - 1); -- A..Z
          FOR c IN 1..v_cols LOOP
            INSERT INTO ASIENTOS (ID_SALA, FILA, COLUMNA, CODIGO, TIPO, ACTIVO)
            VALUES (v_sala, v_row, c, v_row||'-'||TO_CHAR(c), 'NORMAL', 'S');
          END LOOP;
        END LOOP;

        UPDATE SALAS SET CAPACIDAD = v_filas * v_cols WHERE ID_SALA = v_sala;
      END;
      `,
      {
        id_sala: id,
        filas: Number(filas),
        cols: Number(columnas),
        startOrd,
        do_delete: override ? 1 : 0,
      },
      { autoCommit: true }
    );

    res.json({ created: Number(filas) * Number(columnas) });
  } catch (e) {
    console.error('generarAsientosSala', e);
    res.status(500).json({ message: 'Error al generar asientos' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};

// controllers/salas.controller.js
exports.listarAsientosSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    cn = await db.getConnection();
    const r = await cn.execute(
      `SELECT ID_ASIENTO, ID_SALA, FILA, COLUMNA, CODIGO, TIPO, ACTIVO
         FROM ASIENTOS
        WHERE ID_SALA = :id
          AND (ACTIVO = 'S' OR (ACTIVO='N' AND TIPO='DISABLED'))
        ORDER BY FILA, COLUMNA`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json(r.rows || []);
  } catch (e) {
    console.error('listarAsientosSala ->', e.errorNum, e.message);
    res.status(500).json({ message: 'Error al obtener asientos' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};



/** Reemplazo SEGURO del mapa de asientos sin borrar filas previas */
exports.reemplazarMapaAsientos = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { primeraFila = 'A', grid } = req.body || {};
    if (!id || !Array.isArray(grid) || grid.length === 0) {
      return res.status(400).json({ message: 'Payload inválido: grid requerido' });
    }

    const startChar = String(primeraFila).trim().charAt(0).toUpperCase();
    const startOrd = startChar.charCodeAt(0);
    if (startOrd < 65 || startOrd > 90) {
      return res.status(400).json({ message: 'primeraFila debe ser A-Z' });
    }

    cn = await db.getConnection();

    // ❗ Antes de "1) Desactivar todo..."
      const depFun = await cn.execute(
        `SELECT COUNT(*) AS T FROM FUNCIONES WHERE ID_SALA=:id AND ESTADO='ACTIVA'`,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      if (depFun.rows?.[0]?.T > 0) {
        return res.status(409).json({
          message: 'No se puede editar el mapa: la sala tiene funciones ACTIVAS asignadas.'
        });
      }


    // 1) Desactivar todo (no borramos: preserva histórico/FK)
    await cn.execute(`UPDATE ASIENTOS SET ACTIVO='N' WHERE ID_SALA=:id`, { id }, { autoCommit:false });

    // 2) Construir filas (0=vacío, 1=normal, 2=pmr, -1=deshabilitado)
    const rows = [];
    for (let r = 0; r < grid.length; r++) {
      const fila = String.fromCharCode(startOrd + r);
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) {
        const v = Number(row[c] || 0);
        if (v === 0) continue; // vacío => no se crea asiento
        const columna = c + 1;
        const codigo  = `${fila}-${columna}`;
        const tipo    = (v === 2 ? 'PMR' : v === -1 ? 'DISABLED' : 'NORMAL');
        const activo  = (v === -1 ? 'N'   : 'S');
        rows.push({ id_sala: id, fila, columna, codigo, tipo, activo });
      }
    }

    // 3a) UPDATE por (ID_SALA, CODIGO)
    let updated = 0, inserted = 0;
    if (rows.length) {
      const upd = await cn.executeMany(
        `UPDATE ASIENTOS
            SET FILA=:fila, COLUMNA=:columna, TIPO=:tipo, ACTIVO=:activo
          WHERE ID_SALA=:id_sala AND CODIGO=:codigo`,
        rows,
        {
          autoCommit:false,
          bindDefs: {
            id_sala:{ type: oracledb.NUMBER },
            fila:{ type: oracledb.STRING, maxSize:3 },
            columna:{ type: oracledb.NUMBER },
            codigo:{ type: oracledb.STRING, maxSize:20 },
            tipo:{ type: oracledb.STRING, maxSize:20 },
            activo:{ type: oracledb.STRING, maxSize:1 },
          },
          dmlRowCounts:true
        }
      );
      updated = (upd?.dmlRowCounts || []).reduce((a,b)=>a+(b>0?1:0),0);

      // 3b) INSERT; duplicados (UX por ID_SALA+CODIGO) se ignoran con batchErrors
      const ins = await cn.executeMany(
        `INSERT INTO ASIENTOS (ID_SALA, FILA, COLUMNA, CODIGO, TIPO, ACTIVO)
         VALUES (:id_sala, :fila, :columna, :codigo, :tipo, :activo)`,
        rows,
        {
          autoCommit:false,
          bindDefs: {
            id_sala:{ type: oracledb.NUMBER },
            fila:{ type: oracledb.STRING, maxSize:3 },
            columna:{ type: oracledb.NUMBER },
            codigo:{ type: oracledb.STRING, maxSize:20 },
            tipo:{ type: oracledb.STRING, maxSize:20 },
            activo:{ type: oracledb.STRING, maxSize:1 },
          },
          batchErrors:true,
          dmlRowCounts:true
        }
      );
      inserted = (ins?.dmlRowCounts || []).reduce((a,b)=>a+(b>0?1:0),0);
      if (ins?.batchErrors?.length) {
        for (const e of ins.batchErrors) { if (e.errorNum !== 1) console.error('INSERT batch error:', e.errorNum, e.message); }
      }
    }

    // 4) Capacidad (solo activos)
    const cap = await cn.execute(
      `SELECT COUNT(*) AS CAP FROM ASIENTOS WHERE ID_SALA=:id AND ACTIVO='S'`,
      { id },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const activos = Number(cap.rows?.[0]?.CAP || 0);
    await cn.execute(`UPDATE SALAS SET CAPACIDAD=:cap WHERE ID_SALA=:id`, { cap: activos, id }, { autoCommit:false });

    await cn.commit();
    res.json({ updated, inserted, activos });
  } catch (e) {
    try { if (cn) await cn.rollback(); } catch {}
    console.error('reemplazarMapaAsientos ->', e.errorNum, e.message);
    if (e.errorNum === 1) return res.status(409).json({ message: 'Conflicto de unicidad (ID_SALA, CODIGO)' });
    return res.status(500).json({ message: 'Error al guardar el mapa' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};





