// src/pages/Dashboard.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import TipoCambioBadge from '../components/TipoCambioBadge';

// ====== Vistas existentes ======
import RegistrarUsuario from './RegistrarUsuario';
import AsignarModulos from './AsignarModulos';
import AsignarFunciones from './AsignarFunciones';
import CrearCategorias from './CrearCategorias';
import RegistrarClasificacion from './RegistrarClasificacion';
import AgregarNuevaPelicula from './AgregarNuevaPelicula';
import Categorias from './Categorias';
import UnidadMedida from './UnidadMedida';
import Productos from './Productos';
import ActualizarProducto from './ActualizarProducto';
import GestionarSalas from './GestionarSalas';
import VentaDeEntradas from './VentaDeEntradas';
import HistorialVentaEntradas from './HistorialVentaEntradas';
import HistorialReservas from './HistorialReservas';
import ReservasDelDia from './ReservasDelDia';
import SolicitudesReservas from './SolicitudesReservas';
import SnacksCaja from './SnacksCaja';

// ====== Vistas IBER ======
import CrearNuevaVenta from "../pages/vista personal de ventas/CrearNuevaVenta";
import AperturaCaja from "../pages/vista personal de ventas/AperturaCaja";
import CierreDeCaja from "../pages/cierre-de-caja/CierreDeCaja";
import CortedeCaja from "../pages/CortedeCaja";
import NuevoCombo from "../pages/Combos/NuevoCombo";
import lotes from './lotes';

import '../styles/dashboard.css';

/* ================== API BASE ================== */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ======================= Axios con token ======================= */
const client = axios.create({ baseURL: API_BASE, withCredentials: false });
client.interceptors.request.use((cfg) => {
  try {
    const t = localStorage.getItem('mf_token');
    if (t) {
      cfg.headers = cfg.headers || {};
      if (!cfg.headers.Authorization) cfg.headers.Authorization = `Bearer ${t}`;
    }
  } catch {}
  return cfg;
});

/* ========================= Helpers ========================= */
const formatoTitulo = (texto) =>
  !texto ? '' : String(texto).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

const keyfy = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const currency = (v = 0) =>
  Number(v || 0).toLocaleString('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  });

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dm = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

const lastNDates = (n) => {
  const arr = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    arr.push(ymd(d));
  }
  return arr;
};

const parseFecha = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const safeDate = (v) => { try { const d = new Date(v); return isNaN(d) ? null : d; } catch { return null; } };
const sameMonth = (d, y, m) => d && d.getFullYear() === y && d.getMonth() === m;
const isSameDay = (d, ref) =>
  d && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
const isInLastDays = (d, days) => {
  if (!d) return false;
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(end); start.setDate(end.getDate() - (days - 1)); start.setHours(0, 0, 0, 0);
  return d >= start && d <= end;
};
const isSameMonth = (d, ref) => d && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();

/* =================== Helpers de fetch tolerantes =================== */
async function tryGetJson(url, withAuthFirst = true) {
  try {
    if (withAuthFirst) {
      const { data } = await client.get(url);
      return data;
    }
    const { data } = await axios.get(`${API_BASE}${url}`);
    return data;
  } catch {
    return null;
  }
}

/* ======================= Fetch reservas (igual a Historial) ======================= */
async function fetchTodasLasReservas() {
  let data = await tryGetJson('/api/eventos-reservados?all=1');
  const contieneCanceladas = Array.isArray(data) && data.some(r => (r?.ESTADO || '').toUpperCase() === 'CANCELADO');
  const contieneFinalizadas = Array.isArray(data) && data.some(r => (r?.ESTADO || '').toUpperCase() === 'FINALIZADO');

  if ((!contieneCanceladas && !contieneFinalizadas) && Array.isArray(data) && data.length > 0) {
    data = await tryGetJson('/api/eventos-reservados');
  }
  return Array.isArray(data) ? data : [];
}

/* ============ RESERVAS CONFIRMADAS (tabla más presentable) ============ */
const ReservasRecientes = () => {
  const [reservas, setReservas] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchTodasLasReservas();
        if (!mounted) return;
        const soloReservadas = all
          .filter(r => String(r.ESTADO || '').toUpperCase() === 'RESERVADO')
          .sort((a, b) => (safeDate(b.START_TS)?.getTime() || 0) - (safeDate(a.START_TS)?.getTime() || 0))
          .slice(0, 5);
        setReservas(soloReservadas);
      } catch {
        setErr('No se pudieron cargar reservas confirmadas.');
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="card">
      <style>{`
        .rz-table { width:100%; border-collapse:separate; border-spacing:0; }
        .rz-th, .rz-td { padding:10px 12px; text-align:center; }
        .rz-th { font-weight:700; color:#0f172a; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
        .rz-tr:nth-child(even) .rz-td { background:#fbfcfe; }
        .rz-chip { display:inline-block; padding:.2rem .6rem; border-radius:999px; background:#eef2ff; color:#4338ca; font-weight:600; }
        .rz-pill { display:inline-block; padding:.2rem .6rem; border-radius:999px; background:#f1f5f9; }
      `}</style>

      <div className="card-header" style={{ alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>🔔</span>
          <h3 className="card-title m-0">Reservas confirmadas</h3>
        </div>
      </div>

      {err && <p className="text-red-600">{err}</p>}
      {reservas.length === 0 ? (
        <p style={{ margin:'10px 0 0 0' }}>No hay reservas confirmadas recientes</p>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table className="rz-table">
            <thead>
              <tr className="rz-tr">
                <th className="rz-th">Sala</th>
                <th className="rz-th">Fecha y hora</th>
                <th className="rz-th">Personas</th>
                <th className="rz-th">Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const sala = r.SALA_NOMBRE || (r.SALA_ID ? `Sala ${r.SALA_ID}` : 'Sala');
                const fecha = safeDate(r.START_TS)?.toLocaleString() || '-';
                const personas = r.PERSONAS || 0;
                return (
                  <tr key={r.ID_EVENTO} className="rz-tr">
                    <td className="rz-td"><span className="rz-pill">{sala}</span></td>
                    <td className="rz-td">{fecha}</td>
                    <td className="rz-td">{personas}</td>
                    <td className="rz-td"><span className="rz-chip">{(r.ESTADO || '').toUpperCase()}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ===================== RF04: Estadísticas de Reservas ===================== */
const EstadisticasAdminSimple = () => {
  const [data, setData] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState('semana');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setCargando(true);
        const all = await fetchTodasLasReservas();
        if (mounted) setData(all);
      } catch {
        setError('No se pudieron cargar las estadísticas.');
      } finally {
        setCargando(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const hoy = new Date();
  const dataFiltrada = useMemo(() => {
    return (data || []).filter((r) => {
      const d = safeDate(r.START_TS);
      if (!d) return false;
      if (periodo === 'dia') return isSameDay(d, hoy);
      if (periodo === 'semana') return isInLastDays(d, 7);
      return isSameMonth(d, hoy);
    });
  }, [data, periodo, hoy]);

  const stats = useMemo(() => {
    const total = dataFiltrada.length;
    const byEstado = { RESERVADO: 0, CANCELADO: 0, FINALIZADO: 0, OTROS: 0 };
    const bySala = {};
    const porDia = {};

    if (periodo === 'semana') {
      const dias = lastNDates(7); dias.forEach(d => porDia[d] = 0);
    } else if (periodo === 'mes') {
      const y = hoy.getFullYear(); const m = hoy.getMonth();
      const finMes = new Date(y, m + 1, 0).getDate();
      for (let i = 1; i <= finMes; i++) porDia[`${y}-${pad2(m + 1)}-${pad2(i)}`] = 0;
    }

    dataFiltrada.forEach((r) => {
      const est = String(r.ESTADO || '').toUpperCase();
      if (est in byEstado) byEstado[est] += 1; else byEstado.OTROS += 1;
      const salaNom = r.SALA_NOMBRE || (r.SALA_ID ? `Sala ${r.SALA_ID}` : 'Sala');
      bySala[salaNom] = (bySala[salaNom] || 0) + 1;

      const d = safeDate(r.START_TS);
      if (!d) return;
      const k = ymd(d);
      if (k in porDia) porDia[k] += 1;
    });

    const topSalas = Object.entries(bySala)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sala, count]) => ({ sala, count }));

    let serie = [];
    if (periodo === 'dia') {
      const k = ymd(hoy);
      const v = porDia[k] || dataFiltrada.length;
      serie = [{ d: k, v }];
    } else if (periodo === 'semana') {
      serie = lastNDates(7).map((d) => ({ d, v: porDia[d] || 0 }));
    } else {
      const y = hoy.getFullYear(); const m = hoy.getMonth();
      const finMes = new Date(y, m + 1, 0).getDate();
      serie = Array.from({ length: finMes }, (_, i) => {
        const k = `${y}-${pad2(m + 1)}-${pad2(i + 1)}`;
        return { d: k, v: porDia[k] || 0 };
      });
    }
    const maxSerie = Math.max(1, ...serie.map((x) => x.v));
    return { total, byEstado, topSalas, serie, maxSerie };
  }, [dataFiltrada, periodo, hoy]);

  if (cargando) return <div className="card"><h3 className="card-title">📊 Estadísticas</h3><p>Cargando…</p></div>;
  if (error) return <div className="card"><h3 className="card-title">📊 Estadísticas</h3><p className="text-red-600">{error}</p></div>;

  const { byEstado, topSalas } = stats;
  const estados = [
    { key: 'RESERVADO', label: 'Activas', color: '#22c55e' },
    { key: 'CANCELADO', label: 'Canceladas', color: '#ef4444' },
    { key: 'FINALIZADO', label: 'Finalizadas', color: '#6b7280' },
  ];
  const maxBar = Math.max(1, ...estados.map((e) => byEstado[e.key] || 0));
  const tituloLinea = periodo === 'dia' ? 'Hoy' : periodo === 'semana' ? 'Últimos 7 días' : 'Mes actual';

  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="emoji">📊</span>
          <h3 className="card-title m-0">Estadísticas de Reservas</h3>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="filter-select" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card total"><div>Reservas {periodo}</div><div className="kpi-number">{stats.total}</div></div>
        <div className="kpi-card success"><div>Activas</div><div className="kpi-number">{byEstado.RESERVADO || 0}</div></div>
        <div className="kpi-card danger"><div>Canceladas</div><div className="kpi-number">{byEstado.CANCELADO || 0}</div></div>
        <div className="kpi-card muted"><div>Finalizadas</div><div className="kpi-number">{byEstado.FINALIZADO || 0}</div></div>
      </div>

      <div className="charts-grid">
        <div className="chart-box">
          <div className="chart-title">Reservas por estado</div>
          <div className="chart-bars">
            {estados.map((e) => {
              const v = byEstado[e.key] || 0;
              const h = maxBar ? Math.round((v / maxBar) * 120) : 0;
              return (
                <div key={e.key} className="bar-container" title={`${e.label}: ${v}`}>
                  <div className="bar" style={{ height: `${h}px`, background: e.color }} />
                  <div className="bar-label">{v}</div>
                  <div className="bar-sub">{e.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="chart-box">
          <div className="chart-title">{tituloLinea}</div>
          <svg viewBox="0 0 300 140" className="chart-svg">
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <line x1="0" y1="130" x2="300" y2="130" stroke="#e5e7eb" />
            <line x1="28" y1="0" x2="28" y2="130" stroke="#e5e7eb" />
            {stats.serie.map((pt, idx) => {
              const xStep = (300 - 40) / Math.max(1, stats.serie.length - 1);
              const x = 28 + idx * xStep;
              const y = 130 - (pt.v / stats.maxSerie) * 110;
              const next = stats.serie[idx + 1];
              if (!next) return null;
              const x2 = 28 + (idx + 1) * xStep;
              const y2 = 130 - (next.v / stats.maxSerie) * 110;
              return <line key={idx} x1={x} y1={y} x2={x2} y2={y2} stroke="url(#lineGrad)" strokeWidth="2.5" />;
            })}
            {stats.serie.map((pt, idx) => {
              const xStep = (300 - 40) / Math.max(1, stats.serie.length - 1);
              const x = 28 + idx * xStep;
              const y = 130 - (pt.v / stats.maxSerie) * 110;
              return <circle key={`p${idx}`} cx={x} cy={y} r="3.5" fill="#6366f1" />;
            })}
          </svg>
          <div className="chart-days">
            {stats.serie.map((pt) => (<div key={pt.d} className="chart-day">{pt.d.slice(5)}</div>))}
          </div>
        </div>
      </div>

      <div className="chart-box mt-4">
        <div className="chart-title">Top 3 salas por reservas</div>
        {topSalas.length === 0 ? (
          <p className="text-sm text-gray-600">No hay datos para mostrar</p>
        ) : (
          <ul className="list-disc ml-5">
            {topSalas.map((t) => (
              <li key={t.sala}>
                <span className="badge">{t.sala}</span> — {t.count} reserva(s)
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/* ===========================================================
   RESUMEN DE VENTAS (boletos): incluir históricas
   =========================================================== */
function VentasPeriodo() {
  const [loading, setLoading] = useState(true);
  const [funciones, setFunciones] = useState([]);
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState('mes');

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Fallback de endpoints para obtener TODAS las funciones/ventas:
        // 1) cartelera actual, 2) funciones por película, 3) histórico alterno
        const cat = await tryGetJson('/api/empleado/cartelera');
        const altCatalog = await tryGetJson('/api/empleado/cartelera/historico') || [];
        const peliculas = [
          ...new Map(
            [...(Array.isArray(cat) ? cat : []), ...(Array.isArray(altCatalog) ? altCatalog : [])]
            .map(m => [m.id, { id: m.id, titulo: m.titulo || m.nombre || `Pelicula ${m.id}` }])
          ).values()
        ];

        const packs = await Promise.all(
          peliculas.map(async (p) => {
            // probar ambas rutas
            const a = await tryGetJson(`/api/empleado/cartelera/${p.id}/funciones`);
            const b = await tryGetJson(`/api/empleado/cartelera/${p.id}/funciones/historico`);
            const arr = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
            return arr.map((f) => ({
              peliculaId: p.id,
              titulo: p.titulo,
              fecha: f.fecha ?? f.FECHA ?? f.fecha_funcion ?? null,
              precio: Number(f.precio ?? f.PRECIO ?? 0) || 0,
              vendidos: Number(f.vendidos ?? f.VENDIDOS ?? f.ticketsVendidos ?? 0) || 0,
            }));
          })
        );
        if (!cancel) setFunciones(packs.flat());
      } catch {
        if (!cancel) setError('No se pudieron cargar las ventas del período.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const hoy = new Date();
  const Y = hoy.getFullYear();
  const M = hoy.getMonth();
  const finMes = new Date(Y, M + 1, 0);
  const diasMes = finMes.getDate();

  const funcionesFiltradas = useMemo(() => {
    const arr = funciones.map((f) => ({ ...f, _fecha: parseFecha(f.fecha) }));
    if (periodo === 'dia') return arr.filter((f) => isSameDay(f._fecha, hoy));
    if (periodo === 'semana') return arr.filter((f) => isInLastDays(f._fecha, 7));
    return arr.filter((f) => sameMonth(f._fecha, Y, M));
  }, [funciones, periodo, hoy, Y, M]);

  const kpis = useMemo(() => {
    let ingresos = 0, boletos = 0;
    funcionesFiltradas.forEach((f) => {
      ingresos += (f.vendidos || 0) * (f.precio || 0);
      boletos += f.vendidos || 0;
    });
    return { ingresos, boletos };
  }, [funcionesFiltradas]);

  const serie = useMemo(() => {
    if (periodo === 'dia') {
      const v = funcionesFiltradas.reduce((acc, f) => acc + (f.vendidos || 0) * (f.precio || 0), 0);
      return [{ d: dm(hoy), v }];
    }
    if (periodo === 'semana') {
      const days = lastNDates(7).map(d => ({ d: d.slice(5).replace('-', '/'), v: 0 }));
      const map = new Map(days.map((o) => [o.d, 0]));
      funcionesFiltradas.forEach((f) => {
        const k = ymd(f._fecha).slice(5).replace('-', '/');
        map.set(k, (map.get(k) || 0) + (f.vendidos || 0) * (f.precio || 0));
      });
      return days.map((o) => ({ d: o.d, v: map.get(o.d) || 0 }));
    }
    const base = Array.from({ length: diasMes }, (_, i) => ({ d: `${pad2(i + 1)}/${pad2(M + 1)}`, v: 0 }));
    funcionesFiltradas.forEach((f) => {
      const d = f._fecha?.getDate();
      if (!d) return;
      base[d - 1].v += (f.vendidos || 0) * (f.precio || 0);
    });
    return base;
  }, [funcionesFiltradas, periodo, diasMes, M, hoy]);

  const maxV = Math.max(1, ...serie.map((x) => x.v));
  const top = useMemo(() => {
    const map = new Map();
    funcionesFiltradas.forEach((f) => {
      const inc = (f.vendidos || 0) * (f.precio || 0);
      map.set(f.titulo, (map.get(f.titulo) || 0) + inc);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([titulo, inc]) => ({ titulo, inc }));
  }, [funcionesFiltradas]);

  const tituloPeriodo =
    periodo === 'dia' ? `Resumen de ventas — Hoy` :
    periodo === 'semana' ? `Resumen de ventas — Últimos 7 días` :
    `Resumen de ventas — ${pad2(M + 1)}/${Y}`;

  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="emoji">📈</span>
          <h3 className="card-title m-0">{tituloPeriodo}</h3>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="filter-select" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card total"><div>Ingresos</div><div className="kpi-number">{currency(kpis.ingresos)}</div></div>
            <div className="kpi-card success"><div>Boletos vendidos</div><div className="kpi-number">{kpis.boletos}</div></div>
          </div>

          <div className="chart-box">
            <div className="chart-title">Ingresos durante el {periodo === 'dia' ? 'día' : periodo === 'semana' ? 'período' : 'mes'}</div>
            <svg viewBox="0 0 300 140" className="chart-svg">
              <defs>
                <linearGradient id="lineGradMes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="1" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <line x1="0" y1="130" x2="300" y2="130" stroke="#e5e7eb" />
              <line x1="28" y1="0" x2="28" y2="130" stroke="#e5e7eb" />
              {serie.map((pt, idx) => {
                const xStep = (300 - 40) / Math.max(1, serie.length - 1);
                const x = 28 + idx * xStep;
                const y = 130 - (pt.v / Math.max(1, maxV)) * 110;
                const next = serie[idx + 1];
                if (!next) return null;
                const x2 = 28 + (idx + 1) * xStep;
                const y2 = 130 - (next.v / Math.max(1, maxV)) * 110;
                return <line key={idx} x1={x} y1={y} x2={x2} y2={y2} stroke="url(#lineGradMes)" strokeWidth="2.5" />;
              })}
              {serie.map((pt, idx) => {
                const xStep = (300 - 40) / Math.max(1, serie.length - 1);
                const x = 28 + idx * xStep;
                const y = 130 - (pt.v / Math.max(1, maxV)) * 110;
                return <circle key={`pm${idx}`} cx={x} cy={y} r="3.5" fill="#2563eb" />;
              })}
            </svg>
            <div className="chart-days">
              {serie.map((pt, i) => (
                periodo === 'mes'
                  ? (i % Math.ceil(serie.length / 7) === 0 ? <div key={pt.d} className="chart-day">{pt.d}</div> : <div key={pt.d} className="chart-day" />)
                  : <div key={pt.d} className="chart-day">{pt.d}</div>
              ))}
            </div>
          </div>

          <div className="chart-box mt-4">
            <div className="chart-title">Top películas (por ingresos)</div>
            {top.length === 0 ? (
              <p className="text-sm text-gray-600">No hay ventas registradas en este período.</p>
            ) : (
              <ol className="ml-5" style={{ listStyle: 'decimal', paddingLeft: 18 }}>
                {top.map((t) => (
                  <li key={t.titulo} style={{ marginBottom: 6 }}>
                    <span className="badge" style={{ marginRight: 8 }}>{t.titulo}</span>
                    <b>{currency(t.inc)}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ===========================================================
   VENTA DE SNACKS — Día / Semana / Mes (pos_ventas + pos_venta_snack_cli)
   =========================================================== */
function VentaSnacks() {
  const [periodo, setPeriodo] = useState('mes');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);   // { fecha: Date, total: number }
  const [topItems, setTopItems] = useState([]);

  // Parser robusto por si algún día no viene 'YYYY-MM-DD'
  const parseFechaSnack = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    // YYYY-MM-DD
    const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m1) return new Date(+m1[1], +m1[2]-1, +m1[3]);
    // DD/MM/YY [HH:MM(:SS).frac] AM|PM
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i.exec(s);
    if (m) {
      const dd=+m[1], MM=+m[2], yyyy=(m[3].length===2?2000+ +m[3]:+m[3]);
      if (m[4]) { // con hora
        let hh=+m[4]%12; if ((m[7]||'').toUpperCase()==='PM') hh+=12;
        return new Date(yyyy, MM-1, dd, hh, +m[5], +(m[6]||0));
      }
      return new Date(yyyy, MM-1, dd);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };

  const fetchResumen = async (scope) => {
    try {
      const { data } = await client.get(`/api/pedidos-snacks/ventas-resumen?scope=${scope}`);
      const serie = Array.isArray(data?.serie) ? data.serie : [];
      const top   = Array.isArray(data?.top)   ? data.top   : [];
      setRows(
        serie
          .map(r => ({ fecha: parseFechaSnack(r.fecha), total: Number(r.total||0) }))
          .filter(r => r.fecha)
      );
      setTopItems(top.map(t => ({ nombre: t.nombre, qty: Number(t.qty||0) })));
    } catch {
      setRows([]); setTopItems([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchResumen(periodo); }, []); // carga inicial

  // permite cambiar el scope sin redibujar nada más (diseño intacto)
  useEffect(() => { setLoading(true); fetchResumen(periodo); }, [periodo]);

  const hoy = new Date();
  const filtered = rows; // ya viene filtrado desde el backend por 'scope'
  const ingresos = filtered.reduce((s, r) => s + r.total, 0);

  const serie = useMemo(() => {
    if (periodo === 'dia') {
      return [{ d: dm(hoy), v: ingresos }];
    }
    if (periodo === 'semana') {
      const days = lastNDates(7).map(d => ({ d: d.slice(5).replace('-', '/'), v: 0 }));
      const map = new Map(days.map(o => [o.d, 0]));
      filtered.forEach(r => {
        const k = ymd(r.fecha).slice(5).replace('-', '/');
        map.set(k, (map.get(k)||0) + r.total);
      });
      return days.map(o => ({ d:o.d, v: map.get(o.d)||0 }));
    }
    // mes
    const y = hoy.getFullYear(), m = hoy.getMonth();
    const finMes = new Date(y, m+1, 0).getDate();
    const base = Array.from({length: finMes}, (_,i)=>({ d: `${pad2(i+1)}/${pad2(m+1)}`, v: 0 }));
    filtered.forEach(r => { const di = r.fecha.getDate(); base[di-1].v += r.total; });
    return base;
  }, [filtered, periodo, ingresos]);

  const maxV = Math.max(1, ...serie.map(s => s.v));
  const titulo =
    periodo === 'dia' ? `Venta de Snacks — Hoy` :
    periodo === 'semana' ? `Venta de Snacks — Últimos 7 días` :
    `Venta de Snacks — ${pad2(hoy.getMonth()+1)}/${hoy.getFullYear()}`;

  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>🧃</span>
          <h3 className="card-title m-0">{titulo}</h3>
        </div>
        <div style={{ marginLeft:'auto' }}>
          <select value={periodo} onChange={(e)=>setPeriodo(e.target.value)} className="filter-select" style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #e5e7eb' }}>
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card total"><div>Ingresos</div><div className="kpi-number">{currency(ingresos)}</div></div>
          </div>

          <div className="chart-box">
            <div className="chart-title">
              {periodo === 'mes' ? 'Ingresos por mes' : periodo === 'semana' ? 'Ingresos por últimos 7 días' : 'Ingresos de hoy'}
            </div>
            <svg viewBox="0 0 300 140" className="chart-svg">
              <defs>
                <linearGradient id="snxGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity="1" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <line x1="0" y1="130" x2="300" y2="130" stroke="#e5e7eb" />
              <line x1="28" y1="0" x2="28" y2="130" stroke="#e5e7eb" />
              {serie.map((pt, idx) => {
                const xStep = (300 - 40) / Math.max(1, serie.length - 1);
                const x = 28 + idx * xStep;
                const y = 130 - (pt.v / maxV) * 110;
                const next = serie[idx + 1];
                if (!next) return null;
                const x2 = 28 + (idx + 1) * xStep;
                const y2 = 130 - (next.v / maxV) * 110;
                return <line key={idx} x1={x} y1={y} x2={x2} y2={y2} stroke="url(#snxGrad)" strokeWidth="2.5" />;
              })}
              {serie.map((pt, idx) => {
                const xStep = (300 - 40) / Math.max(1, serie.length - 1);
                const x = 28 + idx * xStep;
                const y = 130 - (pt.v / maxV) * 110;
                return <circle key={`sn${idx}`} cx={x} cy={y} r="3.5" fill="#f59e0b" />;
              })}
            </svg>
            <div className="chart-days">
              {serie.map((pt, i) => (
                periodo === 'mes'
                  ? (i % Math.ceil(serie.length / 7) === 0 ? <div key={pt.d} className="chart-day">{pt.d}</div> : <div key={pt.d} className="chart-day" />)
                  : <div key={pt.d} className="chart-day">{pt.d}</div>
              ))}
            </div>
          </div>

          <div className="chart-box mt-4">
            <div className="chart-title">Top productos vendidos</div>
            {topItems.length === 0 ? (
              <p className="text-sm text-gray-600">No hay datos de top disponibles.</p>
            ) : (
              <ol className="ml-5" style={{ listStyle:'decimal', paddingLeft:18 }}>
                {topItems.map((t) => (
                  <li key={t.nombre} style={{ marginBottom:6 }}>
                    <span className="badge" style={{ marginRight:8 }}>{t.nombre}</span>
                    <b>x{t.qty}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}


/* ============================ Dashboard ============================ */
const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [modulesData, setModulesData] = useState([]);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState(null);

  // Tipo de cambio
  const [tc, setTc] = useState({ ref: null, loading: true });
  useEffect(() => {
    let cancel = false;
    const fetchTC = async () => {
      try {
        const { data } = await client.get('/api/tipo-cambio/hoy');
        const ref = (data?.referencia && !isNaN(data.referencia)) ? Number(data.referencia).toFixed(2) : null;
        if (!cancel) setTc({ ref, loading: false });
      } catch {
        if (!cancel) setTc({ ref: null, loading: false });
      }
    };
    fetchTC();
    const id = setInterval(fetchTC, 3 * 60 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // Asegurar módulos extra (igual a tu versión original)
  const ensureExtraModules = (data, isAdmin) => {
    let out = [...data];
    const hasSub = (m, key) =>
      (m.submodulos || []).some((s) => keyfy(s.name) === key || keyfy(s.route) === key);

    const hasReservasDia = out.some((m) =>
      (m.submodulos || []).some(
        (s) => keyfy(s.name).includes('reservas') && keyfy(s.name).includes('dia')
      )
    );
    if (!hasReservasDia) {
      out.push({
        id: -900,
        name: 'Reservas',
        icon: 'fa-calendar',
        submodulos: [
          { id: -901, name: 'Ver Reservas del Día', route: '/reservas/dia', icon: 'fa-calendar-day' },
        ],
      });
    }

    const hasSolicitudes = out.some(
      (m) =>
        keyfy(m.name).includes('solicitudes') ||
        (m.submodulos || []).some((s) => keyfy(s.name) === 'solicitudes')
    );
    if (!hasSolicitudes) {
      out.push({
        id: -910,
        name: 'Solicitudes de Reserva',
        icon: 'fa-clipboard',
        submodulos: [
          { id: -911, name: 'Solicitudes', route: '/solicitudes', icon: 'fa-clipboard-check' },
        ],
      });
    }

    const hasAdminProductos = out.some((m) =>
      ['administracion_productos','administracion_de_productos','administracion productos','administracion de productos']
        .includes(keyfy(m.name))
    );
    if (!hasAdminProductos) {
      out.push({
        id: -920,
        name: 'Administración Productos',
        icon: 'fa-users-gear',
        submodulos: [
          { id: -921, name: 'Nueva Categoría',        route: '/productos/nueva-categoria',  icon: 'fa-tags' },
          { id: -922, name: 'Crear Unidad De Medida', route: '/productos/unidad-medida',    icon: 'fa-ruler' },
          { id: -923, name: 'Agregar Nuevo Producto', route: '/productos/nuevo',            icon: 'fa-box' },
          { id: -924, name: 'Crear Nuevo Lote',       route: '/productos/nuevo-lote',       icon: 'fa-layer-group' },
          { id: -925, name: 'Nuevo Combo',            route: '/productos/nuevo-combo',      icon: 'fa-basket-shopping' },
        ],
      });
    }

    const hasPV = out.some(
      (m) => keyfy(m.name) === 'punto_de_venta' || hasSub(m, 'crear_nueva_venta')
    );
    if (!hasPV) {
      out.push({
        id: -930,
        name: 'Punto De Venta',
        icon: 'fa-cash-register',
        submodulos: [
          { id: -931, name: 'Crear Nueva Venta', route: '/venta/nueva', icon: 'fa-plus-square' },
        ],
      });
    }

    let cajaIdx = out.findIndex(
      (m) =>
        keyfy(m.name) === 'caja' ||
        hasSub(m, 'control_de_caja') ||
        hasSub(m, 'cierre_de_caja')
    );
    if (cajaIdx === -1) {
      out.push({
        id: -940,
        name: 'Caja',
        icon: 'fa-store',
        submodulos: [
          { id: -941, name: 'Control De Caja', route: '/caja/control', icon: 'fa-check-square' },
          { id: -942, name: 'Cierre De Caja',  route: '/caja/cierre',  icon: 'fa-lock' },
          { id: -943, name: 'Pedidos De Snacks', route: '/caja/snacks', icon: 'fa-burger' },
        ],
      });
    } else {
      const caja = { ...out[cajaIdx] };
      caja.submodulos = Array.isArray(caja.submodulos) ? [...caja.submodulos] : [];
      const hasSnacks = caja.submodulos.some(
        (s) => keyfy(s.name) === 'pedidos_de_snacks' || keyfy(s.route) === 'caja_snacks'
      );
      if (!hasSnacks) {
        caja.submodulos.push({ id: -943, name: 'Pedidos De Snacks', route: '/caja/snacks', icon: 'fa-burger' });
      }
      out[cajaIdx] = caja;
    }

    if (isAdmin) {
      const hasDetallesVenta = out.some(
        (m) => keyfy(m.name) === 'detalles_de_venta' || hasSub(m, 'corte_de_caja')
      );
      if (!hasDetallesVenta) {
        out.push({
          id: -950,
          name: 'Detalles De Venta',
          icon: 'fa-receipt',
          submodulos: [
            { id: -951, name: 'Corte de Caja', route: '/detalles-venta/corte-de-caja', icon: 'fa-file-invoice-dollar' },
          ],
        });
      }
    }
    return out;
  };

  useEffect(() => {
    const loadMenu = async () => {
      if (!user?.role_id) return;
      const isAdmin = Number(user.role_id) === 1;
      try {
        const { data } = await client.get(`/api/menu/${user.role_id}`);
        setModulesData(ensureExtraModules(Array.isArray(data) ? data : [], isAdmin));
      } catch {
        setModulesData(ensureExtraModules([], isAdmin));
      }
    };
    loadMenu();
  }, [user]);

  const submoduloComponents = {
    registrar_usuarios: RegistrarUsuario,
    asignacion_de_modulos: AsignarModulos,
    asignar_funciones: AsignarFunciones,
    crear_categoria: CrearCategorias,
    registrar_clasificacion: RegistrarClasificacion,
    crear_clasificacion: RegistrarClasificacion,
    agregar_nueva_pelicula: AgregarNuevaPelicula,
    nueva_categoria: Categorias,
    nueva_categoría: Categorias,
    crear_unidad_de_medida: UnidadMedida,
    unidad_de_medida: UnidadMedida,
    agregar_nuevo_producto: Productos,
    modificar_productos: ActualizarProducto,
    gestionar_salas: GestionarSalas,
    venta_de_entradas: VentaDeEntradas,
    historial_venta_de_entradas: HistorialVentaEntradas,
    historial: HistorialReservas,
    historial_reservas: HistorialReservas,
    historial_eventos: HistorialReservas,
    historial_eventos_reservados: HistorialReservas,
    historial_de_reservas: HistorialReservas,
    reservas: ReservasDelDia,
    reservas_del_dia: ReservasDelDia,
    ver_reservas_del_dia: ReservasDelDia,
    reservas_dia: ReservasDelDia,
    solicitudes: SolicitudesReservas,

    // IBER
    crear_nueva_venta: CrearNuevaVenta,
    control_de_caja: AperturaCaja,
    cierre_de_caja: CierreDeCaja,
    corte_de_caja: CortedeCaja,
    crear_nuevo_lote: lotes,
    nuevo_combo: NuevoCombo,

    // Snacks
    pedidos_de_snacks: SnacksCaja,
    caja_snacks:       SnacksCaja,
  };

  const resolveSubmoduleComponent = (sub) =>
    sub
      ? (submoduloComponents[keyfy(sub.name)] || submoduloComponents[keyfy(sub.route)])
      : null;

  const toggleModule = (id) => {
    setExpandedModuleId(expandedModuleId === id ? null : id);
    setSelectedSubmoduleId(null);
  };
  const handleSubmoduleClick = (id) => setSelectedSubmoduleId(id);
  const handleLogout = () => { localStorage.clear(); logout(); };

  const selectedModule = modulesData.find((m) => m.id === expandedModuleId);
  const selectedSubmodule = selectedModule?.submodulos.find((s) => s.id === selectedSubmoduleId);

  return (
    <div className="dashboard-container">
      {/* Barra de tipo de cambio */}
      <div
        style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, maxWidth: '90%', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', background: 'rgba(255,255,255,0.8)', border: '1px solid #e5e7eb',
          boxShadow: '0 4px 10px rgba(0,0,0,0.08)', padding: '8px 14px', borderRadius: 12,
          fontSize: 14, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(6px)',
        }}
        title="Tipo de cambio de referencia del Banguat"
      >
        <strong>Cambio de dólares a quetzales:</strong>
        <span>{tc.loading ? 'Cargando…' : (tc.ref ? `Q ${tc.ref}` : 'No disponible')}</span>
      </div>

      <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>

      <Sidebar
        modulesData={modulesData}
        expandedModuleId={expandedModuleId}
        onToggleModule={toggleModule}
        selectedSubmoduleId={selectedSubmoduleId}
        onSelectSubmodule={handleSubmoduleClick}
      />

      <main className="main-content">
        {selectedSubmodule ? (
          (() => {
            const SubComp = resolveSubmoduleComponent(selectedSubmodule);
            return SubComp ? (
              <SubComp idAdmin={user?.id} />
            ) : (
              <>
                <h2>{formatoTitulo(selectedSubmodule.name)}</h2>
                <p>Vista sin contenido.</p>
              </>
            );
          })()
        ) : (
          <div>
            <h2>Bienvenido al sistema</h2>
            {user?.role_id === 1 && (
              <>
                <ReservasRecientes />
                <EstadisticasAdminSimple />
                <VentasPeriodo />
                <VentaSnacks />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
