// src/pages/Lotes.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPlus, FaTags, FaSave } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import '../styles/categorias.css'; // reutilizamos estilos

/* ===== API base (alineado a tu proyecto) ===== */
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

/* ===== Normalizador (Oracle MAYÚSCULAS) ===== */
function mapLote(row) {
  return {
    id: row?.ID ?? row?.id ?? null,
    codigo: row?.CODIGO_LOTE ?? row?.codigo_lote ?? row?.codigo ?? null,
    nombre: row?.NOMBRE ?? row?.nombre ?? '',
    fechaRegistro: row?.FECHA_REGISTRO ?? row?.fecha_registro ?? null,
  };
}

const EP = {
  LOTES: '/api/lotes',
  LOTES_BUSCAR: '/api/lotes/buscar', // ?q=
};

const Lotes = () => {
  const [lotesBD, setLotesBD] = useState([]);         // oficiales BD [{id,codigo,nombre,fechaRegistro}]
  const [lotesNuevos, setLotesNuevos] = useState([]); // temporales [{codigoLocal,nombre,isNew}]
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef(null);

  /* ===== Cargar al montar ===== */
  useEffect(() => {
    cargarLotesBD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarLotesBD = async () => {
    try {
      setLoading(true);
      const res = await get(EP.LOTES);
      const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setLotesBD(arr.map(mapLote).filter(x => x.codigo));
    } catch (error) {
      console.error('Error cargando lotes:', error);
      toast.error('Error al cargar lotes');
    } finally {
      setLoading(false);
    }
  };

  /* ===== Código local (solo visual) ===== */
  const generarCodigoLocal = () => {
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const siguiente = String(lotesNuevos.length + 1).padStart(3, '0');
    return `LOTE-${hoy}-${siguiente}`;
  };

  /* ===== Evitar duplicados por nombre (case-insensitive) ===== */
  const nombresExistentes = useMemo(() => {
    const s = new Set([
      ...lotesBD.map(l => (l?.nombre || '').trim().toLowerCase()),
      ...lotesNuevos.map(l => (l?.nombre || '').trim().toLowerCase()),
    ].filter(Boolean));
    return s;
  }, [lotesBD, lotesNuevos]);

  /* ===== Agregar a lista temporal ===== */
  const agregarLote = () => {
    const n = (nombre || '').trim();
    if (!n) return toast.error('El nombre del lote es obligatorio');
    if (n.length < 2) return toast.error('El nombre es demasiado corto');
    if (nombresExistentes.has(n.toLowerCase())) {
      return toast.info('Ese nombre de lote ya existe');
    }

    const nuevo = { codigoLocal: generarCodigoLocal(), nombre: n, isNew: true };
    setLotesNuevos(prev => [...prev, nuevo]);
    setNombre('');
    toast.success(`Lote agregado (código provisional: ${nuevo.codigoLocal})`);
  };

  /* ===== Guardar en BD ===== */
  const guardarLotes = async () => {
    if (lotesNuevos.length === 0) {
      toast.info('No hay lotes nuevos para guardar');
      return;
    }
    try {
      setLoading(true);
      const payload = { lotes: lotesNuevos.map(l => ({ nombre: l.nombre })) };
      const res = await post(EP.LOTES, payload);
      const msg = res?.data?.message || 'Lotes guardados';
      const todos = res?.data?.lotesTodos || res?.data?.data || res?.data || [];
      setLotesBD((Array.isArray(todos) ? todos : []).map(mapLote).filter(x => x.codigo));
      setLotesNuevos([]);
      toast.success(msg);
    } catch (error) {
      console.error('Error al guardar lotes:', error);
      const msg = error?.response?.data?.message || error?.response?.data?.error || 'Error al guardar lotes';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ===== Buscar en BD (debounce) ===== */
  const onBuscar = (texto) => {
    setBusqueda(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const q = (texto || '').trim();
      if (!q) {
        cargarLotesBD();
        return;
      }
      try {
        setLoading(true);
        const res = await get(EP.LOTES_BUSCAR, { params: { q } });
        const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        setLotesBD(arr.map(mapLote).filter(x => x.codigo));
      } catch (error) {
        console.error('Error al buscar lotes:', error);
        toast.error('Error al buscar lotes');
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  /* ===== Quitar de lista temporal ===== */
  const quitarTemporal = (codigoLocal) => {
    setLotesNuevos(prev => prev.filter(l => l.codigoLocal !== codigoLocal));
    toast.info('Lote eliminado de la lista temporal');
  };

  return (
    <div className="categorias-container">
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Lote</h3>

        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />

        <input
          type="text"
          placeholder='Ej: "Lote A", "Lote B"'
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') agregarLote(); }}
        />

        <div className="fila-acciones">
          <button className="btn-azul" onClick={agregarLote}>
            <FaTags /> Agregar Lote
          </button>
          <button
            className="btn-verde"
            onClick={guardarLotes}
            disabled={lotesNuevos.length === 0 || loading}
          >
            <FaSave /> Guardar Todo
          </button>
        </div>
      </div>

      {/* Lista oficial (BD) */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Lotes Registrados</h3>
          <span className="badge">{lotesBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar lote por código o nombre..."
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        {/* Lista BD */}
        <div className={`lista-categorias ${loading ? 'is-loading' : ''}`}>
          {lotesBD.map((l) => (
            <div className="item-categoria" key={l.id || l.codigo}>
              <div className="item-info">
                <FaTags /> <strong>{l.codigo}</strong>
                <p>{l.nombre}</p>
                {l.fechaRegistro && <small>Creado: {l.fechaRegistro}</small>}
              </div>
              {/* Política: no borrar lotes en BD */}
            </div>
          ))}

          {!loading && lotesBD.length === 0 && (
            <div className="vacio">No hay lotes registrados.</div>
          )}
        </div>
      </div>

      {/* Lista temporal (nuevos) */}
      {lotesNuevos.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Lotes Nuevos</h3>
            <span className="badge">{lotesNuevos.length}</span>
          </div>
          <div className="lista-categorias">
            {lotesNuevos.map((l) => (
              <div className="item-categoria" key={l.codigoLocal}>
                <div className="item-info">
                  <FaTags /> <strong>{l.codigoLocal}</strong>
                  <p>{l.nombre}</p>
                </div>
                <button className="btn-rojo" onClick={() => quitarTemporal(l.codigoLocal)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Lotes;
