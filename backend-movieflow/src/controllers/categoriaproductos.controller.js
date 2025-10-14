const db = require('../config/db');
const oracledb = require('oracledb');
const xss = require('xss');
const { validationResult } = require('express-validator');

/**
 * 📌 Agregar varias categorías en lote
 */
exports.agregarCategoriasLote = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    let { categorias } = req.body;

    if (!Array.isArray(categorias) || categorias.length === 0) {
        return res.status(400).json({ message: 'Debe enviar al menos una categoría.' });
    }

    categorias = categorias.map(cat => ({
        codigo: xss(cat.codigo?.trim() || ''),
        nombre: xss(cat.nombre?.trim() || '')
    })).filter(cat => cat.nombre);

    if (categorias.length === 0) {
        return res.status(400).json({ message: 'Todas las categorías deben tener un nombre válido.' });
    }

    let connection;
    try {
        connection = await db.getConnection();

        const nombres = categorias.map(c => c.nombre.toLowerCase());
        const placeholders = nombres.map((_, i) => `:n${i}`).join(', ');

        const dupCheck = await connection.execute(
            `SELECT LOWER(NOMBRE) AS NOMBRE
             FROM POS_CATEGORIAPRODUCTO
             WHERE LOWER(NOMBRE) IN (${placeholders})`,
            Object.fromEntries(nombres.map((n, i) => [`n${i}`, n])),
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (dupCheck.rows.length > 0) {
            const duplicados = dupCheck.rows.map(r => r.NOMBRE).join(', ');
            return res.status(400).json({ message: `El nombre ya existe: ${duplicados}` });
        }

        const result = await connection.execute(
            `SELECT CODIGO 
             FROM POS_CATEGORIAPRODUCTO
             ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        let ultimoNumero = 0;
        if (result.rows.length > 0) {
            const ultimoCodigo = result.rows[0].CODIGO;
            ultimoNumero = parseInt(ultimoCodigo.replace("CAT", ""), 10) || 0;
        }

        const categoriasFinal = categorias.map((c, idx) => ({
            codigo: `CAT${String(ultimoNumero + idx + 1).padStart(3, '0')}`,
            nombre: c.nombre
        }));

        for (const cat of categoriasFinal) {
            await connection.execute(
                `INSERT INTO POS_CATEGORIAPRODUCTO (CODIGO, NOMBRE, FECHA_CREACION) 
                 VALUES (:codigo, :nombre, SYSDATE)`,
                { codigo: cat.codigo, nombre: cat.nombre },
                { autoCommit: false }
            );
        }

        await connection.commit();

        // 🔹 Traer todas las categorías actualizadas
        const todasCategorias = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE, FECHA_CREACION
             FROM POS_CATEGORIAPRODUCTO
             ORDER BY CODIGO ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.status(201).json({
            message: `${categoriasFinal.length} categorías agregadas correctamente.`,
            categoriasNuevas: categoriasFinal,    // solo las recién insertadas
            categoriasTodas: todasCategorias.rows // TODAS las categorías en BD
        });

    } catch (error) {
        console.error('Error al guardar categorías en lote:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Error al guardar categorías.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 🔍 Buscar categorías
 */
exports.buscarCategorias = async (req, res) => {
    const query = xss(req.query.q?.trim() || '');
    if (!query) return res.json([]);

    let connection;
    try {
        connection = await db.getConnection();
        const result = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE
             FROM POS_CATEGORIAPRODUCTO
             WHERE LOWER(CODIGO) LIKE :q OR LOWER(NOMBRE) LIKE :q
             ORDER BY CODIGO ASC`,
            { q: `%${query.toLowerCase()}%` },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al buscar categorías:', error);
        res.status(500).json({ message: 'Error al buscar categorías.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 🗑 Eliminar categoría con validación de dependencias
 */
exports.eliminarCategoria = async (req, res) => {
    const codigo = xss(req.params.codigo?.trim() || '');
    if (!codigo) return res.status(400).json({ message: 'Código no válido.' });

    let connection;
    try {
        connection = await db.getConnection();

        // Validar si hay productos asociados
        const check = await connection.execute(
            `SELECT COUNT(*) AS TOTAL
             FROM POS_PRODUCTO_NUEVO
             WHERE CATEGORIA_ID = (
               SELECT ID FROM CATEGORIAPRODUCTO WHERE CODIGO = :codigo
             )`,
            { codigo },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (check.rows[0].TOTAL > 0) {
            return res.status(400).json({
                message: 'No se puede eliminar esta categoría porque está asociada a productos existentes.'
            });
        }

        const result = await connection.execute(
            `DELETE FROM POS_CATEGORIAPRODUCTO WHERE CODIGO = :codigo`,
            { codigo },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Categoría no encontrada.' });
        }

        res.json({ message: `Categoría ${codigo} eliminada correctamente.` });

    } catch (error) {
        console.error('Error al eliminar categoría:', error);
        res.status(500).json({ message: 'Error al eliminar categoría.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 📋 Listar todas las categorías
 */
exports.listarCategorias = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const result = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE, FECHA_CREACION
             FROM POS_CATEGORIAPRODUCTO
             ORDER BY CODIGO ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al listar categorías:', error);
        res.status(500).json({ message: 'Error al listar categorías.' });
    } finally {
        if (connection) await connection.close();
    }
};
