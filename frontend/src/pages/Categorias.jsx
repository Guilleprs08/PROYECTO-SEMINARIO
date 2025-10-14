// src/pages/Categorias.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { FaPlus, FaTags, FaSave, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import '../styles/categorias.css';

/* ===== API base (alineado a MovieFlow) ===== */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ===== Helpers de Auth / Axios ===== */
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const get = (p, cfg = {}) =>
  axios.get(`${API_BASE}${p}`, {
    ...cfg,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
  });
const post = (p, data = {}, cfg = {}) =>
  axios.post(`${API_BASE}${p}`, data, {
    ...cfg,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(cfg.headers || {}) },
  });
const del = (p, cfg = {}) =>
  axios.delete(`${API_BASE}${p}`, {
    ...cfg,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
  });

/* ===== Normalizador de filas (Oracle devuelve MAYÚSCULAS) ===== */
function mapCat(row) {
  // Soporta {CODIGO, NOMBRE} o {codigo, nombre}
  return {
    codigo: row?.CODIGO ?? row?.codigo ?? row?.id ?? row?.ID ?? null,
    nombre: row?.NOMBRE ?? row?.nombre ?? '',
  };
}

const Categorias = () => {
  const [categoriasBD, setCategoriasBD] = useState([]);        // ← BD normalizada [{codigo,nombre}]
  const [categoriasNuevas, setCategoriasNuevas] = useState([]); // ← temporales [{codigo,nombre,isNew}]
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);

  /* ===== Cargar categorías al iniciar ===== */
  useEffect(() => {
    cargarCategoriasBD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarCategoriasBD = async () => {
    try {
      setLoading(true);
      const res = await get('/api/categoria-productos');
      const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setCategoriasBD(arr.map(mapCat).filter(x => x.codigo));
    } catch (error) {
      console.error('Error cargando categorías:', error);
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  /* ===== Generar código provisional local (solo visual) ===== */
  const generarCodigoLocal = () => {
    // num correlativo sobre temporales (no afecta BD)
    const totalNuevas = categoriasNuevas.length + 1;
    return `CAT${String(totalNuevas).padStart(3, '0')}`;
  };

  /* ===== Validaciones de duplicados (insensible a mayúsculas) ===== */
  const nombresExistentes = useMemo(() => {
    const s = new Set(
      [
        ...categoriasBD.map(c => (c?.nombre || '').trim().toLowerCase()),
        ...categoriasNuevas.map(c => (c?.nombre || '').trim().toLowerCase()),
      ].filter(Boolean)
    );
    return s;
  }, [categoriasBD, categoriasNuevas]);

  /* ===== Agregar categoría temporal ===== */
  const agregarCategoria = () => {
    const n = (nombre || '').trim();
    if (!n) {
      toast.error('El nombre de la categoría es obligatorio');
      return;
    }
    if (n.length < 2) {
      toast.error('El nombre es demasiado corto');
      return;
    }
    if (nombresExistentes.has(n.toLowerCase())) {
      toast.info('Ya existe una categoría con ese nombre');
      return;
    }

    const nuevaCategoria = {
      codigo: generarCodigoLocal(), // provisional
      nombre: n,
      isNew: true,
    };

    setCategoriasNuevas(prev => [...prev, nuevaCategoria]);
    setNombre('');
    toast.success(`Categoría agregada (código provisional: ${nuevaCategoria.codigo})`);
  };

  /* ===== Guardar lote en BD ===== */
  const guardarCategorias = async () => {
    if (categoriasNuevas.length === 0) {
      toast.info('No hay categorías nuevas para guardar');
      return;
    }
    try {
      setLoading(true);
      // El backend sólo necesita nombres
      const payload = {
        categorias: categoriasNuevas.map(({ nombre }) => ({ nombre })),
      };
      const res = await post('/api/categoria-productos/lote', payload);
      // Soportar { message, categoriasTodas } o retorno directo de lista
      const msg = res?.data?.message || 'Categorías guardadas';
      const todas = res?.data?.categoriasTodas || res?.data?.data || res?.data || [];
      setCategoriasBD((Array.isArray(todas) ? todas : []).map(mapCat).filter(x => x.codigo));
      setCategoriasNuevas([]);
      toast.success(msg);
    } catch (error) {
      console.error('Error al guardar categorías:', error);
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        'Error al guardar categorías';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ===== Buscar con debounce ===== */
  const onBuscar = (texto) => {
    setBusqueda(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const q = (texto || '').trim();
      if (!q) {
        cargarCategoriasBD();
        return;
      }
      try {
        setLoading(true);
        const res = await get('/api/categoria-productos/buscar', { params: { q } });
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setCategoriasBD(arr.map(mapCat).filter(x => x.codigo));
      } catch (error) {
        console.error('Error al buscar categorías:', error);
        toast.error('Error al buscar categorías');
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  /* ===== Eliminar (BD o temporal) ===== */
  const eliminarCategoria = async (codigo, isNew) => {
    if (isNew) {
      setCategoriasNuevas(prev => prev.filter(cat => cat.codigo !== codigo));
      toast.info(`Categoría ${codigo} eliminada de la lista temporal`);
      return;
    }
    try {
      setLoading(true);
      await del(`/api/categoria-productos/${encodeURIComponent(codigo)}`);
      setCategoriasBD(prev => prev.filter(cat => cat.codigo !== codigo));
      toast.info(`Categoría ${codigo} eliminada`);
    } catch (error) {
      console.error('Error al eliminar categoría:', error);
      toast.error('No se pudo eliminar la categoría (puede estar asociada a un producto)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="categorias-container">
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Categoría</h3>

        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />

        <input
          type="text"
          placeholder="Ej: jugos, bebidas calientes, caja"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') agregarCategoria();
          }}
        />

        <div className="fila-acciones">
          <button className="btn-azul" onClick={agregarCategoria}>
            <FaTags /> Agregar Categoría
          </button>
          <button className="btn-verde" onClick={guardarCategorias} disabled={categoriasNuevas.length === 0 || loading}>
            <FaSave /> Guardar Todo
          </button>
        </div>
      </div>

      {/* Lista oficial (BD) */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Categorías Registradas</h3>
          <span className="badge">{categoriasBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar categoría..."
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        {/* Lista de BD */}
        <div className={`lista-categorias ${loading ? 'is-loading' : ''}`}>
          {categoriasBD.map((cat) => (
            <div className="item-categoria" key={cat.codigo}>
              <div className="item-info">
                <FaTags /> <strong>{cat.codigo}</strong>
                <p>{cat.nombre}</p>
              </div>
              <button
                className="btn-rojo"
                onClick={() => eliminarCategoria(cat.codigo, false)}
                disabled={loading}
              >
                <FaTrash /> Eliminar
              </button>
            </div>
          ))}

          {!loading && categoriasBD.length === 0 && (
            <div className="vacio">No hay categorías registradas.</div>
          )}
        </div>
      </div>

      {/* Lista temporal (nuevas) */}
      {categoriasNuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Categorías Nuevas</h3>
            <span className="badge">{categoriasNuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {categoriasNuevas.map((cat) => (
              <div className="item-categoria" key={cat.codigo}>
                <div className="item-info">
                  <FaTags /> <strong>{cat.codigo}</strong>
                  <p>{cat.nombre}</p>
                </div>
                <button
                  className="btn-rojo"
                  onClick={() => eliminarCategoria(cat.codigo, true)}
                  disabled={loading}
                >
                  <FaTrash /> Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Categorias;
