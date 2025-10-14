// src/pages/UnidadMedida.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPlus, FaBalanceScale, FaSave, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import '../styles/categorias.css';

/* ===== API base como en MovieFlow ===== */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ===== Helpers Auth / Axios ===== */
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

/* ===== Normalizador (Oracle suele devolver MAYÚSCULAS) ===== */
function mapUm(row) {
  return {
    codigo: row?.CODIGO ?? row?.codigo ?? row?.ID ?? row?.id ?? null,
    nombre: row?.NOMBRE ?? row?.nombre ?? '',
    isNew: false,
  };
}

const UnidadMedida = () => {
  const [unidadesBD, setUnidadesBD] = useState([]);       // desde BD, normalizadas [{codigo,nombre}]
  const [unidadesNuevas, setUnidadesNuevas] = useState([]); // temporales [{codigo,nombre,isNew}]
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  /* ===== Cargar al montar ===== */
  useEffect(() => {
    cargarUnidadesBD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarUnidadesBD = async () => {
    try {
      setLoading(true);
      const res = await get('/api/unidadmedida');
      const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setUnidadesBD(arr.map(mapUm).filter(x => x.codigo));
    } catch (e) {
      console.error('Error cargando unidades:', e);
      toast.error('Error al cargar unidades');
    } finally {
      setLoading(false);
    }
  };

  /* ===== Código local provisional (solo visual) ===== */
  const generarCodigoLocal = () => {
    const totalNuevas = unidadesNuevas.length + 1;
    return `UM${String(totalNuevas).padStart(3, '0')}`;
  };

  /* ===== Validar duplicados (case-insensitive, BD + nuevas) ===== */
  const nombresExistentes = useMemo(() => {
    return new Set(
      [
        ...unidadesBD.map(u => (u?.nombre || '').trim().toLowerCase()),
        ...unidadesNuevas.map(u => (u?.nombre || '').trim().toLowerCase()),
      ].filter(Boolean)
    );
  }, [unidadesBD, unidadesNuevas]);

  /* ===== Agregar temporal ===== */
  const agregarUnidad = () => {
    const n = (nombre || '').trim();
    if (!n) return toast.error('El nombre de la unidad de medida es obligatorio');
    if (n.length < 2) return toast.error('El nombre es demasiado corto');
    if (nombresExistentes.has(n.toLowerCase())) {
      return toast.info('Ya existe una unidad con ese nombre');
    }

    const nueva = { codigo: generarCodigoLocal(), nombre: n, isNew: true };
    setUnidadesNuevas(prev => [...prev, nueva]);
    setNombre('');
    toast.success(`Unidad agregada (código provisional: ${nueva.codigo})`);
  };

  /* ===== Guardar lote en BD ===== */
  const guardarUnidades = async () => {
    if (unidadesNuevas.length === 0) {
      toast.info('No hay unidades nuevas para guardar');
      return;
    }
    try {
      setLoading(true);
      // Backend espera { unidades: [{ nombre }] }
      const payload = { unidades: unidadesNuevas.map(({ nombre }) => ({ nombre })) };
      const res = await post('/api/unidadmedida/lote', payload);

      const msg = res?.data?.message || 'Unidades guardadas';
      const todas = res?.data?.unidadesTodas || res?.data?.data || res?.data || [];
      setUnidadesBD((Array.isArray(todas) ? todas : []).map(mapUm).filter(x => x.codigo));
      setUnidadesNuevas([]);
      toast.success(msg);
    } catch (e) {
      console.error('Error al guardar unidades:', e);
      const msg = e?.response?.data?.message || e?.response?.data?.error || 'Error al guardar unidades';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ===== Buscar (con debounce) ===== */
  const onBuscar = (texto) => {
    setBusqueda(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const q = (texto || '').trim();
      if (!q) {
        cargarUnidadesBD();
        return;
      }
      try {
        setLoading(true);
        const res = await get('/api/unidadmedida/buscar', { params: { q } });
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setUnidadesBD(arr.map(mapUm).filter(x => x.codigo));
      } catch (e) {
        console.error('Error al buscar unidades:', e);
        toast.error('Error al buscar unidades');
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  /* ===== Eliminar (temporal o BD) ===== */
  const eliminarUnidad = async (codigo, isNew) => {
    if (isNew) {
      setUnidadesNuevas(prev => prev.filter(u => u.codigo !== codigo));
      toast.info(`Unidad ${codigo} eliminada de la lista temporal`);
      return;
    }
    try {
      setLoading(true);
      await del(`/api/unidadmedida/${encodeURIComponent(codigo)}`);
      setUnidadesBD(prev => prev.filter(u => u.codigo !== codigo));
      toast.info(`Unidad ${codigo} eliminada`);
    } catch (e) {
      console.error('Error al eliminar unidad:', e);
      toast.error('No se pudo eliminar la unidad');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="categorias-container">
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Unidad de Medida</h3>

        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />

        <input
          type="text"
          placeholder="Ej: Litro, Gramo, Unidad"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') agregarUnidad();
          }}
        />

        <div className="fila-acciones">
          <button className="btn-azul" onClick={agregarUnidad}>
            <FaBalanceScale /> Agregar Unidad
          </button>
          <button className="btn-verde" onClick={guardarUnidades} disabled={unidadesNuevas.length === 0 || loading}>
            <FaSave /> Guardar Todo
          </button>
        </div>
      </div>

      {/* Lista BD */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Unidades de Medida Registradas</h3>
          <span className="badge">{unidadesBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar unidad..."
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        <div className={`lista-categorias ${loading ? 'is-loading' : ''}`}>
          {unidadesBD.map((um) => (
            <div className="item-categoria" key={um.codigo}>
              <div className="item-info">
                <FaBalanceScale /> <strong>{um.codigo}</strong>
                <p>{um.nombre}</p>
              </div>
              <button
                className="btn-rojo"
                onClick={() => eliminarUnidad(um.codigo, false)}
                disabled={loading}
              >
                <FaTrash /> Eliminar
              </button>
            </div>
          ))}

          {!loading && unidadesBD.length === 0 && (
            <div className="vacio">No hay unidades registradas.</div>
          )}
        </div>
      </div>

      {/* Lista temporal (nuevas) */}
      {unidadesNuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Nuevas Unidades</h3>
            <span className="badge">{unidadesNuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {unidadesNuevas.map((um) => (
              <div className="item-categoria" key={um.codigo}>
                <div className="item-info">
                  <FaBalanceScale /> <strong>{um.codigo}</strong>
                  <p>{um.nombre}</p>
                </div>
                <button
                  className="btn-rojo"
                  onClick={() => eliminarUnidad(um.codigo, true)}
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

export default UnidadMedida;
