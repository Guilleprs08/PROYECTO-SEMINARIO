import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import '../styles/historial.css';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';
const get = (p, cfg = {}) => axios.get(`${API_BASE}${p}`, cfg);

const currency = (v = 0) =>
  Number(v || 0).toLocaleString('es-GT', {
    style: 'currency', currency: 'GTQ', minimumFractionDigits: 2,
  });

// ---- Fechas ----
const parseFechaLocal = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const diasAbbr = ['Dom', 'Lun', 'Mar', 'Miér', 'Jue', 'Vie', 'Sáb'];
const pad2 = (n) => String(n).padStart(2, '0');
const fechaLarga = (yyyy_mm_dd) => {
  const d = parseFechaLocal(yyyy_mm_dd);
  if (!d) return '—';
  return `${diasAbbr[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const parseFechaHoraLocal = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(v || '');
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fechaHoraCorta = (yyyy_mm_dd_hhmm) => {
  const d = parseFechaHoraLocal(yyyy_mm_dd_hhmm);
  if (!d) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export default function HistorialVentasEntradas() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [peliculas, setPeliculas] = useState([]);
  const [salas, setSalas] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [funciones, setFunciones] = useState([]);

  const [peliculaId, setPeliculaId] = useState('ALL');
  const [salaId, setSalaId] = useState('ALL');
  const [metodo, setMetodo] = useState('ALL');
  const [funcionId, setFuncionId] = useState('ALL');

  const fetchOpciones = async () => {
    const { data } = await get('/api/admin/historial/opciones');
    setPeliculas(data?.peliculas || []);
    setSalas(data?.salas || []);
    setMetodos(data?.metodosPago || []);
  };
  const fetchFunciones = async () => {
    const params = {};
    if (peliculaId !== 'ALL') params.peliculaId = Number(peliculaId);
    if (salaId !== 'ALL') params.salaId = Number(salaId);
    const { data } = await get('/api/admin/historial/funciones', { params });
    setFunciones(Array.isArray(data) ? data : []);
  };
  const fetchTabla = async () => {
    setLoading(true);
    try {
      const params = {};
      if (peliculaId !== 'ALL') params.peliculaId = Number(peliculaId);
      if (salaId !== 'ALL') params.salaId = Number(salaId);
      if (metodo !== 'ALL') params.metodoPago = metodo;
      if (funcionId !== 'ALL') params.funcionId = Number(funcionId);
      const { data } = await get('/api/admin/historial/ventas', { params });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchOpciones();
      await fetchFunciones();
      await fetchTabla();
    })();
  }, []);

  // Al cambiar película o sala, reinicia función y recarga opciones
  useEffect(() => {
    setFuncionId('ALL');
    fetchFunciones();
  }, [peliculaId, salaId]);

  // La tabla se actualiza automáticamente al cambiar cualquier filtro
  useEffect(() => {
    fetchTabla();
  }, [peliculaId, salaId, metodo, funcionId]);

  const vacio = useMemo(() => !loading && rows.length === 0, [loading, rows]);

  const labelFuncion = (f) => {
    const d = fechaLarga(f.fecha);
    const hora = f.horaInicio;
    const sala = f.sala;
    const formato = f.formato ? ` · ${f.formato}` : '';
    return `${d} · ${hora} · ${sala}${formato}`;
  };

  const limpiarFiltros = () => {
    setPeliculaId('ALL');
    setSalaId('ALL');
    setMetodo('ALL');
    setFuncionId('ALL');
  };

  return (
    <div className="hv-wrap">
      {/* HERO */}
      <div className="hv-hero">
        <div className="hv-hero-card">
          <h1>📈 Historial de Venta de Entradas</h1>
          <p>Revisa las ventas por película, sala, método de pago y función.</p>
        </div>

        {/* Toolbar de filtros */}
        <div className="hv-toolbar">
          <div className="hv-field">
            <label>🎬 Película</label>
            <select value={peliculaId} onChange={(e) => setPeliculaId(e.target.value)}>
              <option value="ALL">Todas</option>
              {peliculas.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo}</option>
              ))}
            </select>
          </div>

          <div className="hv-field">
            <label>🏟️ Sala</label>
            <select value={salaId} onChange={(e) => setSalaId(e.target.value)}>
              <option value="ALL">Todas</option>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>

          <div className="hv-field">
            <label>💳 Método de pago</label>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option value="ALL">Todos</option>
              {metodos.map((m) => (
                <option key={m} value={m}>{m || '—'}</option>
              ))}
            </select>
          </div>

          <div className="hv-field">
            <label>🗓️ Función</label>
            <select value={funcionId} onChange={(e) => setFuncionId(e.target.value)}>
              <option value="ALL">Todas</option>
              {funciones.map((f) => (
                <option key={f.id} value={f.id}>{labelFuncion(f)}</option>
              ))}
            </select>
          </div>

          <div className="hv-actions">
            {/* Se quitó el botón Buscar; queda solo Limpiar */}
            <button type="button" className="hv-btn hv-btn-ghost" onClick={limpiarFiltros}>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <section className="hv-tablebox">
        {loading && <div className="hv-loading">Cargando…</div>}
        {vacio && <div className="hv-empty">Sin resultados con los filtros aplicados.</div>}

        {!loading && rows.length > 0 && (
          <table className="hv-table">
            <thead>
              <tr>
                <th>PELÍCULA</th>
                <th>SALA</th>
                <th>FUNCIÓN</th>
                <th>ASIENTOS</th>
                <th>ID VENTA</th>
                <th>FECHA DE VENTA</th>
                <th>MÉTODO DE PAGO</th>
                <th>MONTO TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.compraId}-${i}`}>
                  <td>{r.pelicula}</td>
                  <td>{r.sala}</td>
                  <td>{fechaLarga(r.fecha)}</td>
                  <td className="hv-mono">{r.asientos || '—'}</td>
                  <td className="hv-mono">{r.compraId}</td>
                  <td className="hv-mono">{fechaHoraCorta(r.fechaVenta)}</td>
                  <td>{r.metodoPago || '—'}</td>
                  <td className="hv-num">{currency(r.montoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
