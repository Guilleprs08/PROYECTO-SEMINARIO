// src/pages/RegistrarCategoria.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaPlus, FaTags, FaSave } from 'react-icons/fa';
import '../styles/categorias.css';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

export default function RegistrarCategoria() {
  // ===== BD =====
  const [categoriasBD, setCategoriasBD] = useState([]);
  const [cargando, setCargando] = useState(false);

  // ===== Form / temporales =====
  const [nombre, setNombre] = useState('');
  const [sinopsis, setSinopsis] = useState('');
  const [nuevas, setNuevas] = useState([]); // [{codigo, nombre, sinopsis}]
  const [guardando, setGuardando] = useState(false);

  // ===== Buscador =====
  const [busqueda, setBusqueda] = useState('');
  const debounceRef = useRef(null);

  // ---- Cargar BD ----
  const cargarCategorias = async () => {
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE}/api/categorias`);
      setCategoriasBD(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudieron cargar las categorías';
      toast.error(msg);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargarCategorias(); }, []);

  // ---- Helpers ----
  const codigoLocal = useMemo(() => `CAT${String(nuevas.length + 1).padStart(3,'0')}`, [nuevas.length]);

  const nombresExistentes = useMemo(() => new Set(
    [
      ...categoriasBD.map(c => (c?.NOMBRE ?? c?.nombre ?? '').trim().toLowerCase()),
      ...nuevas.map(c => (c?.nombre ?? '').trim().toLowerCase())
    ].filter(Boolean)
  ), [categoriasBD, nuevas]);

  // ---- Acciones izquierda ----
  const agregarTemporal = () => {
    const n = (nombre||'').trim();
    const s = (sinopsis||'').trim();
    if (!n) return toast.warn('Ingrese un nombre de categoría');
    if (n.length > 80) return toast.warn('El nombre no debe superar 80 caracteres');
    if (!s) return toast.warn('Ingrese una sinopsis para la categoría');
    if (s.length > 500) return toast.warn('La sinopsis no debe superar 500 caracteres');
    if (nombresExistentes.has(n.toLowerCase())) return toast.info('Ya existe una categoría con ese nombre');

    setNuevas(prev => [...prev, { codigo: codigoLocal, nombre: n, sinopsis: s }]);
    setNombre(''); setSinopsis('');
    toast.success('Categoría agregada');
  };

  const eliminarTemporal = (codigo) => {
    setNuevas(prev => prev.filter(x => x.codigo !== codigo));
  };

  const guardarTodo = async () => {
    if (nuevas.length === 0) return toast.info('No hay categorías nuevas para guardar');
    try {
      setGuardando(true);
      for (const cat of nuevas) {
        await axios.post(`${API_BASE}/api/categorias`, { nombre: cat.nombre, sinopsis: cat.sinopsis });
      }
      toast.success('Categorías guardadas');
      setNuevas([]);          // ⬅ se vacía => desaparecerá la tarjeta
      await cargarCategorias();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudo guardar';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  // ---- Buscador ----
  const onBuscar = (texto) => {
    setBusqueda(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = (texto||'').trim().toLowerCase();
      if (!q) { cargarCategorias(); return; }
      setCategoriasBD(prev => prev.filter(cat => {
        const n = (cat?.NOMBRE ?? cat?.nombre ?? '').toLowerCase();
        const s = (cat?.SINOPSIS ?? cat?.sinopsis ?? '').toLowerCase();
        const c = (cat?.CODIGO ?? cat?.codigo ?? '').toLowerCase();
        return n.includes(q) || s.includes(q) || c.includes(q);
      }));
    }, 300);
  };

  return (
    <div className="categorias-container categorias--tres">
      {/* Izquierda */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Categoría de Películas</h3>

        <input
          type="text"
          placeholder="Ej: Acción, Suspenso, Comedia"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
          onKeyDown={(e) => e.key === 'Enter' && agregarTemporal()}
        />
        <textarea
          placeholder="Sinopsis de la categoría (máx. 500)"
          rows={4}
          value={sinopsis}
          onChange={(e) => setSinopsis(e.target.value)}
          maxLength={500}
          style={{ resize: 'none' }}
        />

        <div className="fila-acciones">
          <button className="btn-azul" onClick={agregarTemporal}>
            <FaTags /> Agregar Categoría
          </button>
          <button className="btn-verde" onClick={guardarTodo} disabled={guardando || nuevas.length===0}>
            <FaSave /> {guardando ? 'Guardando...' : 'Guardar Todo'}
          </button>
        </div>

        {/* Lista temporal dentro de la izquierda (opcional) */}
        {/* Puedes quitar este bloque si no la quieres aquí */}
      </div>

      {/* Centro: registradas */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Categorías Registradas</h3>
          <span className="badge">{categoriasBD.length}</span>
        </div>
        <div className="buscador">
          <input type="text" placeholder="Buscar categoría..." value={busqueda} onChange={(e)=>onBuscar(e.target.value)} />
        </div>
        <div className={`lista-categorias ${cargando ? 'is-loading' : ''}`}>
          {cargando ? (
            <div className="vacio">Cargando categorías...</div>
          ) : categoriasBD.length === 0 ? (
            <div className="vacio">Sin categorías registradas</div>
          ) : (
            categoriasBD.map((cat, i) => {
              const idVal = cat?.ID ?? cat?.id ?? i;
              const codigo = cat?.CODIGO ?? cat?.codigo ?? `ID-${idVal}`;
              const nombreVal = cat?.NOMBRE ?? cat?.nombre ?? '—';
              const sinVal = cat?.SINOPSIS ?? cat?.sinopsis ?? '—';
              return (
                <div className="item-categoria" key={idVal}>
                  <div className="item-info">
                    <FaTags /> <strong>{codigo}</strong>
                    <p>{nombreVal}</p>
                    <small className="muted" title={typeof sinVal === 'string' ? sinVal : ''}>{sinVal}</small>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Derecha: NUEVAS — se muestra SOLO si hay items */}
      {nuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Categorías Nuevas</h3>
            <span className="badge">{nuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {nuevas.map(cat => (
              <div className="item-categoria" key={cat.codigo}>
                <div className="item-info">
                  <FaTags /> <strong>{cat.codigo}</strong>
                  <p>{cat.nombre}</p>
                  <small className="muted">{cat.sinopsis}</small>
                </div>
                <button className="btn-rojo" onClick={() => eliminarTemporal(cat.codigo)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
