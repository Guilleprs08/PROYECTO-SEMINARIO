const oracledb = require('oracledb');
const db = require('../config/db');
const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// GET /api/admin/historial/ventas
exports.listarVentas = async (req, res) => {
  let cn;
  try {
    const { peliculaId, salaId, metodoPago, funcionId } = req.query;
    cn = await db.getConnection();

    const where = [];
    const bind = {};

    if (peliculaId) { where.push(`p.ID_PELICULA = :peliculaId`); bind.peliculaId = Number(peliculaId); }
    if (salaId)     { where.push(`s.ID_SALA     = :salaId`);     bind.salaId     = Number(salaId); }
    if (metodoPago) { where.push(`c.METODO_PAGO = :metodoPago`); bind.metodoPago = String(metodoPago); }
    if (funcionId)  { where.push(`c.ID_FUNCION  = :funcionId`);  bind.funcionId  = Number(funcionId); }

    const sql = `
      SELECT
        c.ID_COMPRA                                       AS "compraId",
        p.TITULO                                          AS "pelicula",
        s.NOMBRE                                          AS "sala",
        TO_CHAR(f.FECHA, 'YYYY-MM-DD')                    AS "fecha",       -- fecha de la FUNCIÓN
        TO_CHAR(c.FECHA,'YYYY-MM-DD HH24:MI')    AS "fechaVenta",  -- fecha/hora de la VENTA
        c.METODO_PAGO                                     AS "metodoPago",
        c.MONTO_TOTAL                                     AS "montoTotal",
        COALESCE(
          (SELECT LISTAGG(a.FILA || '-' || a.COLUMNA, ', ')
                  WITHIN GROUP (ORDER BY a.FILA, a.COLUMNA)
             FROM ENTRADAS e
             JOIN FUNCION_ASIENTO fa ON fa.ID_FA = e.ID_FA
             JOIN ASIENTOS a         ON a.ID_ASIENTO = fa.ID_ASIENTO
            WHERE e.ID_COMPRA = c.ID_COMPRA),
          ''
        )                                                AS "asientos"
      FROM COMPRAS c
      JOIN FUNCIONES f ON f.ID_FUNCION = c.ID_FUNCION
      JOIN PELICULA  p ON p.ID_PELICULA = f.ID_PELICULA
      JOIN SALAS     s ON s.ID_SALA     = f.ID_SALA
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY c.ID_COMPRA, p.TITULO, s.NOMBRE, f.FECHA, c.FECHA, c.METODO_PAGO, c.MONTO_TOTAL
      ORDER BY c.FECHA DESC, c.ID_COMPRA DESC
    `;
    const r = await cn.execute(sql, bind, OUT_OBJ);
    res.json(r.rows || []);
  } catch (e) {
    console.error('GET /api/admin/historial/ventas ->', e);
    res.status(500).json({ message: 'Error al listar ventas' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

// GET /api/admin/historial/opciones (sin cambios)
exports.opciones = async (_req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const [pelis, salas, metodos] = await Promise.all([
      cn.execute(`SELECT ID_PELICULA AS "id", TITULO AS "titulo" FROM PELICULA ORDER BY TITULO ASC`, {}, OUT_OBJ),
      cn.execute(`SELECT ID_SALA AS "id", NOMBRE AS "nombre" FROM SALAS ORDER BY NOMBRE ASC`, {}, OUT_OBJ),
      cn.execute(`SELECT DISTINCT METODO_PAGO AS "metodo" FROM COMPRAS ORDER BY METODO_PAGO NULLS LAST`, {}, OUT_OBJ),
    ]);
    res.json({
      peliculas: pelis.rows || [],
      salas: salas.rows || [],
      metodosPago: (metodos.rows || []).map((r) => r.metodo).filter((x) => x !== null),
    });
  } catch (e) {
    console.error('GET /api/admin/historial/opciones ->', e);
    res.status(500).json({ message: 'Error al cargar opciones' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

// GET /api/admin/historial/funciones  (?peliculaId=&salaId=)
exports.funciones = async (req, res) => {
  let cn;
  try {
    const { peliculaId, salaId } = req.query;
    cn = await db.getConnection();

    const where = [`f.ESTADO='ACTIVA'`];
    const bind = {};
    if (peliculaId) { where.push(`f.ID_PELICULA = :peliculaId`); bind.peliculaId = Number(peliculaId); }
    if (salaId)     { where.push(`f.ID_SALA     = :salaId`);     bind.salaId     = Number(salaId); }

    const sql = `
      SELECT
        f.ID_FUNCION                                  AS "id",
        TO_CHAR(f.FECHA,'YYYY-MM-DD')                 AS "fecha",
        TO_CHAR(f.FECHA + f.HORA_INICIO,'HH24:MI')    AS "horaInicio",
        s.NOMBRE                                      AS "sala",
        frm.NOMBRE                                    AS "formato",
        p.TITULO                                      AS "pelicula"
      FROM FUNCIONES f
      JOIN PELICULA  p ON p.ID_PELICULA = f.ID_PELICULA
      JOIN SALAS     s ON s.ID_SALA     = f.ID_SALA
      LEFT JOIN FORMATO frm ON frm.ID_FORMATO = f.ID_FORMATO
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY f.FECHA DESC, f.HORA_INICIO DESC
    `;
    const r = await cn.execute(sql, bind, OUT_OBJ);
    res.json(r.rows || []);
  } catch (e) {
    console.error('GET /api/admin/historial/funciones ->', e);
    res.status(500).json({ message: 'Error al listar funciones' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};
