// src/pages/DasboarddeGraficas.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import '../styles/dashboard-compact.css';

/* === Chart.js (barras pastel) === */
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

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
    { key: 'RESERVADO', label: 'Activas', color: 'rgba(34,197,94,0.45)' },
    { key: 'CANCELADO', label: 'Canceladas', color: 'rgba(239,68,68,0.45)' },
    { key: 'FINALIZADO', label: 'Finalizadas', color: 'rgba(107,114,128,0.45)' }
  ];

  /* === Barras por estado (pastel) === */
  const dataEstado = {
    labels: estados.map(e => e.label),
    datasets: [{
      label: 'Reservas',
      data: estados.map(e => byEstado[e.key] || 0),
      backgroundColor: estados.map(e => e.color),
      borderColor: estados.map(e => e.color.replace('0.45', '0.85')),
      borderWidth: 1,
      borderRadius: 8,
      barThickness: 28,
    }]
  };
  const optionsEstado = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
  };

  /* === Barras temporales: Día / Semana / Mes === */
  const diaNombres = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  const datasetSemana = () => {
    const ultimos7 = lastNDates(7).map(s => new Date(s));
    const labels = ultimos7.map(d => diaNombres[d.getDay()]);
    const valores = ultimos7.map(d => {
      const key = ymd(d);
      const pt = stats.serie.find(x => x.d === key);
      return pt ? pt.v : 0;
    });
    return { labels, valores };
  };

  const getWeekOfMonth = (date) => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Lunes=0
    return Math.floor((offset + date.getDate() - 1) / 7) + 1;
  };
  const buildWeekRanges = (Y, M) => {
    const start = new Date(Y, M, 1);
    const end = new Date(Y, M + 1, 0);
    const ranges = [];
    let d = new Date(start);
    while (d <= end) {
      const w = getWeekOfMonth(d);
      const r = ranges[w-1];
      if (!r) ranges[w-1] = { w, ini: new Date(d), fin: new Date(d) };
      else ranges[w-1].fin = new Date(d);
      d.setDate(d.getDate() + 1);
    }
    return ranges;
  };

  const subtitleLinea = (periodo === 'dia' ? 'Hoy' : (periodo === 'semana' ? 'Últimos 7 días' : 'Mes actual'));

  let dataSerie, optionsSerie;
  if (periodo === 'dia') {
    const label = `Hoy (${dm(new Date())})`;
    dataSerie = {
      labels: [label],
      datasets: [{
        label: 'Reservas',
        data: [stats.serie[0]?.v || 0],
        backgroundColor: 'rgba(99,102,241,0.35)',
        borderColor: 'rgba(99,102,241,0.85)',
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 36,
      }]
    };
    optionsSerie = {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
    };
  } else if (periodo === 'semana') {
    const { labels, valores } = datasetSemana();
    dataSerie = {
      labels,
      datasets: [{
        label: 'Reservas por día',
        data: valores,
        backgroundColor: 'rgba(99,102,241,0.35)',
        borderColor: 'rgba(99,102,241,0.85)',
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 22,
      }]
    };
    optionsSerie = {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
    };
  } else {
    const ref = new Date();
    const Y = ref.getFullYear(), M = ref.getMonth();
    const ranges = buildWeekRanges(Y, M);
    const valores = ranges.map(r => {
      let sum = 0;
      let d = new Date(r.ini);
      while (d <= r.fin) {
        const key = ymd(d);
        const pt = stats.serie.find(x => x.d === key);
        sum += pt ? pt.v : 0;
        d.setDate(d.getDate() + 1);
      }
      return sum;
    });
    dataSerie = {
      labels: ranges.map(r => `Sem ${r.w}`),
      datasets: [{
        label: 'Reservas por semana',
        data: valores,
        backgroundColor: 'rgba(99,102,241,0.35)',
        borderColor: 'rgba(99,102,241,0.85)',
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 22,
      }]
    };
    optionsSerie = {
      responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items[0].dataIndex;
            const r = ranges[idx];
            return `Sem ${r.w} (${dm(r.ini)} – ${dm(r.fin)})`;
          }
        }
      }},
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
    };
  }

  return (
    <div className="card reserva-confirmada">
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="emoji">📊</span>
          <h3 className="card-title m-0">Estadísticas de Reservas</h3>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <select value={periodo} onChange={(e)=>setPeriodo(e.target.value)} className="filter-select" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card total"><div>Reservas {periodo}</div><div className="kpi-number">{(dataFiltrada?.length)||0}</div></div>
        <div className="kpi-card success"><div>Activas</div><div className="kpi-number">{(stats.byEstado?.RESERVADO)||0}</div></div>
        <div className="kpi-card danger"><div>Canceladas</div><div className="kpi-number">{(stats.byEstado?.CANCELADO)||0}</div></div>
        <div className="kpi-card muted"><div>Finalizadas</div><div className="kpi-number">{(stats.byEstado?.FINALIZADO)||0}</div></div>
      </div>

      {/* Apilado vertical de las dos gráficas dentro de esta card */}
      <div className="charts-grid">
        <div className="chart-box">
          <div className="chart-title">Reservas por estado</div>
          <div style={{ width: '100%', height: 220 }}>
            <Bar data={dataEstado} options={optionsEstado} />
          </div>
        </div>

        <div className="chart-box">
          <div className="chart-title">{subtitleLinea}</div>
          <div style={{ width: '100%', height: 220 }}>
            <Bar data={dataSerie} options={optionsSerie} />
          </div>
        </div>
      </div>

      <div className="chart-box mt-4">
        <div className="chart-title">Top 3 salas por reservas</div>
        {stats.topSalas.length === 0 ? (
          <p className="text-sm text-gray-600">No hay datos para mostrar</p>
        ) : (
          <ul className="list-disc ml-5">
            {stats.topSalas.map((t) => (
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
   RESUMEN DE VENTAS (boletos): incluir históricas (resiliente)
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
        const cat = await tryGetJson('/api/empleado/cartelera') || [];
        const altCatalog = await tryGetJson('/api/empleado/cartelera/historico') || [];

        const peliculas = [
          ...new Map(
            [...(Array.isArray(cat) ? cat : []), ...(Array.isArray(altCatalog) ? altCatalog : [])]
            .map(m => [m.id, { id: m.id, titulo: m.titulo || m.nombre || `Pelicula ${m.id}` }])
          ).values()
        ];

        const packs = await Promise.all(
          peliculas.map(async (p) => {
            try {
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
            } catch {
              return [];
            }
          })
        );

        if (!cancel) setFunciones(packs.flat());
      } catch {
        if (!cancel) setError('');
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

  const pastelBlue = 'rgba(37,99,235,0.30)';
  const pastelBlueBorder = 'rgba(37,99,235,0.85)';

  let dataVentas, optionsVentas, tituloPeriodo =
    periodo === 'dia' ? `Resumen de ventas — Hoy` :
    periodo === 'semana' ? `Resumen de ventas — Últimos 7 días` :
    `Resumen de ventas — ${pad2(M + 1)}/${Y}`;

  if (periodo === 'dia') {
    dataVentas = {
      labels: [`Hoy (${dm(hoy)})`],
      datasets: [{
        label: 'Ingresos',
        data: [serie[0]?.v || 0],
        backgroundColor: pastelBlue,
        borderColor: pastelBlueBorder,
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 36,
      }]
    };
  } else if (periodo === 'semana') {
    const ultimos7 = lastNDates(7).map(s => new Date(s));
    const semanaLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const valores = ultimos7.map(d => {
      const pt = serie.find(x => x.d === `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}`);
      return pt ? pt.v : 0;
    });
    dataVentas = {
      labels: semanaLabels,
      datasets: [{
        label: 'Ingresos por día',
        data: valores,
        backgroundColor: pastelBlue,
        borderColor: pastelBlueBorder,
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 22,
      }]
    };
  } else {
    const ranges = (() => {
      const start = new Date(Y, M, 1);
      const end = new Date(Y, M + 1, 0);
      const getWeekOfMonth = (date) => {
        const first = new Date(date.getFullYear(), date.getMonth(), 1);
        const offset = (first.getDay() + 6) % 7;
        return Math.floor((offset + date.getDate() - 1) / 7) + 1;
      };
      const out = []; let d = new Date(start);
      while (d <= end) {
        const w = getWeekOfMonth(d);
        if (!out[w-1]) out[w-1] = { ini: new Date(d), fin: new Date(d) };
        else out[w-1].fin = new Date(d);
        d.setDate(d.getDate() + 1);
      }
      return out;
    })();
    const valores = ranges.map(r => {
      let sum = 0, d = new Date(r.ini);
      while (d <= r.fin) {
        const k = `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
        const pt = serie.find(x => x.d === k);
        sum += pt ? pt.v : 0;
        d.setDate(d.getDate() + 1);
      }
      return sum;
    });
    dataVentas = {
      labels: ranges.map((_, i) => `Sem ${i+1}`),
      datasets: [{
        label: 'Ingresos por semana',
        data: valores,
        backgroundColor: pastelBlue,
        borderColor: pastelBlueBorder,
        borderWidth: 1,
        borderRadius: 8,
        barThickness: 22,
      }]
    };
  }

  optionsVentas = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
  };

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
        <>
          <div className="kpi-grid">
            <div className="kpi-card total"><div>Ingresos</div><div className="kpi-number">{currency(0)}</div></div>
            <div className="kpi-card success"><div>Boletos vendidos</div><div className="kpi-number">0</div></div>
          </div>
          <div className="chart-box">
            <div className="chart-title">Ingresos durante el período</div>
            <div style={{ width: '100%', height: 220 }}>
              <Bar data={{ labels: [], datasets: [{ data: [] }] }} options={optionsVentas} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card total"><div>Ingresos</div><div className="kpi-number">{currency(kpis.ingresos)}</div></div>
            <div className="kpi-card success"><div>Boletos vendidos</div><div className="kpi-number">{kpis.boletos}</div></div>
          </div>

          <div className="chart-box">
            <div className="chart-title">
              {periodo === 'mes' ? 'Ingresos por semana del mes' : periodo === 'semana' ? 'Ingresos por día (últimos 7 días)' : 'Ingresos de hoy'}
            </div>
            <div style={{ width: '100%', height: 220 }}>
              <Bar data={dataVentas} options={optionsVentas} />
            </div>
          </div>

          <div className="chart-box mt-4">
            <div className="chart-title">Top películas (por ingresos)</div>
            {(() => {
              const map = new Map();
              funcionesFiltradas.forEach((f) => {
                const inc = (f.vendidos || 0) * (f.precio || 0);
                map.set(f.titulo, (map.get(f.titulo) || 0) + inc);
              });
              const top = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
              return top.length === 0 ? (
                <p className="text-sm text-gray-600">No hay ventas registradas en este período.</p>
              ) : (
                <ol className="ml-5" style={{ listStyle: 'decimal', paddingLeft: 18 }}>
                  {top.map(([titulo, inc]) => (
                    <li key={titulo} style={{ marginBottom: 6 }}>
                      <span className="badge" style={{ marginRight: 8 }}>{titulo}</span>
                      <b>{currency(inc)}</b>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ Página contenedora ============================ */
export default function DasboarddeGraficas() {
  return (
    <div className="dashboard-compact">
      <div className="charts-row-50">
        <EstadisticasAdminSimple />
        <VentasPeriodo />
      </div>
    </div>
  );
}
