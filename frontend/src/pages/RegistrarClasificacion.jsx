import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaPlus, FaTags, FaSave } from 'react-icons/fa';
import '../styles/categorias.css'; // reutilizamos el mismo CSS

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

export default function RegistrarClasificacion() {
  // ===== BD =====
  const [clasificacionesBD, setClasificacionesBD] = useState([]);
  const [cargando, setCargando] = useState(false);

  // ===== Form / temporales =====
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [nuevas, setNuevas] = useState([]); // [{temp, nombre, descripcion}]
  const [guardando, setGuardando] = useState(false);

  // ===== Buscador (centro) =====
  const [busqueda, setBusqueda] = useState('');
  const debounceRef = useRef(null);

  // ---- Cargar BD ----
  const cargarClasificaciones = async () => {
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE}/api/clasificaciones`);
      setClasificacionesBD(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudieron cargar las clasificaciones';
      toast.error(msg);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargarClasificaciones(); }, []);

  // ---- Helpers ----
  const tempCodigo = useMemo(
    () => `CLF${String(nuevas.length + 1).padStart(3, '0')}`,
    [nuevas.length]
  );

  const nombresExistentes = useMemo(() => new Set(
    [
      ...clasificacionesBD.map(c => (c?.NOMBRE ?? c?.nombre ?? '').trim().toLowerCase()),
      ...nuevas.map(c => (c?.nombre ?? '').trim().toLowerCase())
    ].filter(Boolean)
  ), [clasificacionesBD, nuevas]);

  // ---- Acciones izquierda ----
  const agregarTemporal = () => {
    const n = (nombre || '').trim();
    const d = (descripcion || '').trim();

    if (!n) return toast.warn('Ingrese un nombre de clasificación');
    if (n.length > 50) return toast.warn('El nombre no debe superar 50 caracteres');
    if (!d) return toast.warn('Ingrese una descripción para la clasificación');
    if (d.length > 500) return toast.warn('La descripción no debe superar 500 caracteres');
    if (nombresExistentes.has(n.toLowerCase()))
      return toast.info('Ya existe una clasificación con ese nombre');

    setNuevas(prev => [...prev, { temp: tempCodigo, nombre: n, descripcion: d }]);
    setNombre(''); setDescripcion('');
    toast.success('Clasificación agregada');
  };

  const eliminarTemporal = (temp) => {
    setNuevas(prev => prev.filter(x => x.temp !== temp));
  };

  const guardarTodo = async () => {
    if (nuevas.length === 0) return toast.info('No hay clasificaciones nuevas para guardar');
    try {
      setGuardando(true);
      for (const it of nuevas) {
        await axios.post(`${API_BASE}/api/clasificaciones`, {
          nombre: it.nombre,
          descripcion: it.descripcion
        });
      }
      toast.success('Clasificaciones guardadas');
      setNuevas([]);                // ⬅ desaparece el panel derecho
      await cargarClasificaciones();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudo registrar la clasificación';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  // ---- Buscador (centro) ----
  const onBuscar = (texto) => {
    setBusqueda(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = (texto || '').trim().toLowerCase();
      if (!q) { cargarClasificaciones(); return; }
      setClasificacionesBD(prev => prev.filter(cl => {
        const n = (cl?.NOMBRE ?? cl?.nombre ?? '').toLowerCase();
        const d = (cl?.DESCRIPCION ?? cl?.descripcion ?? '').toLowerCase();
        const id = String(cl?.ID ?? cl?.id ?? '').toLowerCase();
        return n.includes(q) || d.includes(q) || id.includes(q);
      }));
    }, 300);
  };

  return (
    <div className="categorias-container categorias--tres">
      {/* ===== Izquierda ===== */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Clasificación de Películas</h3>

        <input
          type="text"
          placeholder="Ej: Acción, Suspenso, Comedia"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={50}
          onKeyDown={(e) => e.key === 'Enter' && agregarTemporal()}
        />
        <textarea
          placeholder="Descripción de la clasificación (máx. 500)"
          rows={4}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={500}
          style={{ resize: 'none' }}
        />

        <div className="fila-acciones">
          <button className="btn-azul" onClick={agregarTemporal}>
            <FaTags /> Agregar Clasificación
          </button>
          <button
            className="btn-verde"
            onClick={guardarTodo}
            disabled={guardando || nuevas.length === 0}
          >
            <FaSave /> {guardando ? 'Guardando...' : 'Guardar Todo'}
          </button>
        </div>
      </div>

      {/* ===== Centro: registradas ===== */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Clasificaciones Registradas</h3>
          <span className="badge">{clasificacionesBD.length}</span>
        </div>

        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar clasificación..."
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        <div className={`lista-categorias ${cargando ? 'is-loading' : ''}`}>
          {cargando ? (
            <div className="vacio">Cargando clasificaciones...</div>
          ) : clasificacionesBD.length === 0 ? (
            <div className="vacio">Sin clasificaciones registradas</div>
          ) : (
            clasificacionesBD.map((cl, i) => {
              const idVal = cl?.ID ?? cl?.id ?? i;
              const nombreVal = cl?.NOMBRE ?? cl?.nombre ?? '—';
              const descVal = cl?.DESCRIPCION ?? cl?.descripcion ?? '—';
              return (
                <div className="item-categoria" key={idVal}>
                  <div className="item-info">
                    <FaTags /> <strong>{`ID-${idVal}`}</strong>
                    <p>{nombreVal}</p>
                    <small className="muted" title={typeof descVal === 'string' ? descVal : ''}>
                      {descVal}
                    </small>
                  </div>
                  {/* sin eliminar en registradas (mismo flujo que Categorías) */}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ===== Derecha: nuevas (condicional) ===== */}
      {nuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Clasificaciones Nuevas</h3>
            <span className="badge">{nuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {nuevas.map((cl) => (
              <div className="item-categoria" key={cl.temp}>
                <div className="item-info">
                  <FaTags /> <strong>{cl.temp}</strong>
                  <p>{cl.nombre}</p>
                  <small className="muted">{cl.descripcion}</small>
                </div>
                <button className="btn-rojo" onClick={() => eliminarTemporal(cl.temp)}>
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
