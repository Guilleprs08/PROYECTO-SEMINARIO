// src/pages/MisReservas.jsx
import { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/clientecartelera.css';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ==================== Sesión ==================== */
function getClienteId() {
  const v = localStorage.getItem('clienteId');
  return v ? Number(v) : null;
}
function getClienteEmail() {
  try {
    const raw = localStorage.getItem('mf_user');
    if (raw) {
      const u = JSON.parse(raw);
      return u?.email || u?.correo || null;
    }
  } catch {}
  try {
    const t = localStorage.getItem('mf_token');
    if (t && t.includes('.')) {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload?.email || payload?.correo || null;
    }
  } catch {}
  return null;
}
function authHeaders() {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ==================== UI utils ==================== */
const cleanNotas = (txt = '') =>
  txt.replace(/\[UEMAIL:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();

function fmtHoraFromISO(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' });
}
function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-GT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function EstadoBadge({ estado = '—', puedeCancelar }) {
  const up = String(estado).toUpperCase();

  // Etiqueta amigable
  const label =
    up === 'RESERVADO' ? 'PENDIENTE' :
    up === 'CANCELADO' ? 'CANCELADA' :
    up === 'FINALIZADO' ? 'FINALIZADA' :
    estado;

  // Colores según estado
  let bg = '#e5e7eb', color = '#111827';
  if (up === 'CANCELADO') { bg = '#fee2e2'; color = '#991b1b'; }
  else if (up === 'RESERVADO') { // "Pendiente"
    bg = puedeCancelar ? '#dcfce7' : '#fde68a';
    color = puedeCancelar ? '#166534' : '#92400e';
  }
  else if (up === 'FINALIZADO') { bg = '#e2e8f0'; color = '#334155'; }

  return (
    <span
      style={{
        fontSize: 12,
        padding: '6px 10px',
        borderRadius: 999,
        fontWeight: 800,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/* ============ Normalizador API -> UI ============ */
function mapRowToUI(r) {
  const start = r.START_TS ? new Date(r.START_TS) : null;
  const now = new Date();
  const puedeCancelar =
    String(r.ESTADO || '').toUpperCase() === 'RESERVADO' &&
    start instanceof Date &&
    !isNaN(start) &&
    start.getTime() - now.getTime() >= 24 * 60 * 60 * 1000;

  return {
    id: r.ID_EVENTO,
    salaId: r.SALA_ID,
    salaNombre: r.SALA_NOMBRE,
    inicioISO: r.START_TS,
    finISO: r.END_TS,
    personas: r.PERSONAS,
    notas: r.NOTAS,
    estado: r.ESTADO,
    puedeCancelar,
  };
}

/* ============ Filtro por fecha (cliente) ============ */
const toDateOnly = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const parseYMD = (yyyymmdd) => {
  if (!yyyymmdd) return null;
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function rangeMatches(inicioISO, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const startDay = toDateOnly(inicioISO);
  if (!startDay) return false;
  if (dateFrom && !dateTo) {
    const from = parseYMD(dateFrom);
    return startDay >= from;
  }
  if (!dateFrom && dateTo) {
    const to = endOfDay(parseYMD(dateTo));
    return startDay <= to;
  }
  const from = parseYMD(dateFrom);
  const to = endOfDay(parseYMD(dateTo));
  return startDay >= from && startDay <= to;
}

/* ==================== Componente ==================== */
export default function MisReservas() {
  const navigate = useNavigate();

  // ==== Fix global scroll + estilos buscador ====
  const GlobalFix = () => (
    <style>{`
      html, body, #root { height:auto!important; min-height:100%!important; overflow-y:auto!important; overflow-x:hidden!important; }
      .mr-page { position:relative; display:block; min-height:100%!important; height:auto!important; overflow:visible!important; }
      body { margin:0!important; padding:0!important; }

      /* --- Buscador por fecha --- */
      .cf-search { 
        background: rgba(255,255,255,0.06); 
        border-radius: 14px; 
        padding: 14px; 
        margin-bottom: 12px; 
      }
      .cf-search .row-grid {
        display: flex; 
        flex-wrap: wrap; 
        align-items: flex-end; 
        justify-content: center; 
        gap: 12px;
      }
      .cf-search .cf-field {
        display: flex; 
        flex-direction: column; 
        gap: 6px; 
        min-width: 180px; 
        max-width: 240px;
        flex: 0 1 220px;
      }
      .cf-search label {
        color: #cbd5e1; 
        font-size: 13px; 
        font-weight: 700; 
        letter-spacing: .2px;
      }
      .cf-search input[type="date"] {
        padding: 10px 12px; 
        border-radius: 10px; 
        border: 1px solid #334155; 
        background: #0b1726; 
        color: #e2e8f0;
        outline: none;
      }
      /* Icono del calendario en blanco (Blink/WebKit) */
      .cf-search input[type="date"]::-webkit-calendar-picker-indicator{
        filter: invert(1) brightness(1.6) contrast(1.2);
        opacity: 1;
        cursor: pointer;
      }

      .cf-search .toolbar {
        display: flex; 
        gap: 8px; 
        flex-wrap: wrap; 
        align-items: center;
      }
      .cf-btn-mini {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid #334155;
        background: linear-gradient(90deg, #f59e0b, #ef4444);
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,.12);
        width: auto;
        min-width: unset;
      }
      .cf-btn-mini:active { transform: translateY(1px); }
      @media (max-width: 520px){
        .cf-search .cf-field { min-width: 160px; flex: 1 1 100%; }
        .cf-search .toolbar { justify-content: center; }
      }

      /* === KPIs de estado === */
      .kpi-row{ display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin: 6px 0 14px; }
      .kpi-chip{
        display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:12px;
        border:1px solid #22314a; background:#0b1320; color:#d9e4ff; font-weight:800; letter-spacing:.2px;
      }
      .kpi-dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }
      .kpi-p{ background:#fbbf24; }    /* Pendiente */
      .kpi-c{ background:#ef4444; }    /* Canceladas */
      .kpi-f{ background:#94a3b8; }    /* Finalizadas */
    `}</style>
  );
  const pageRef = useRef(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, []);

  // ==== Estado ====
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [confirmId, setConfirmId] = useState(null);
  const [loadingCancel, setLoadingCancel] = useState(false);

  // Filtros por estado
  const [filtro, setFiltro] = useState('todas');

  // Filtro por fecha (RF06)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const clienteId = useMemo(() => getClienteId(), []);
  const email = useMemo(() => getClienteEmail(), []);

  const fetchReservas = async () => {
    if (!clienteId && !email) {
      setLoading(false);
      setErr('No se encontró sesión de cliente.');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clienteId) params.append('clienteId', String(clienteId));
      if (email) params.append('email', String(email));

      const res = await fetch(
        `${API_BASE}/api/eventos-reservados/mis?${params.toString()}`,
        { headers: { ...authHeaders() } }
      );
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
        setReservas([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(mapRowToUI) : [];
      list.sort((a, b) => new Date(b.inicioISO) - new Date(a.inicioISO));
      setReservas(list);
    } catch (e) {
      setErr(e.message || 'Error al cargar reservas');
      setReservas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReservas(); }, [clienteId, email]);

  const confirmarCancelacion = async () => {
    if (!confirmId) return;
    try {
      setLoadingCancel(true);
      await fetch(`${API_BASE}/api/eventos-reservados/${confirmId}/cancelar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ clienteId, email }),
      });
      await fetchReservas();
    } finally {
      setLoadingCancel(false);
      setConfirmId(null);
    }
  };

  // === Contadores KPI (aplican solo el filtro de fechas, no el filtro de estado) ===
  const kpi = useMemo(() => {
    const base = { P: 0, C: 0, F: 0 };
    reservas.forEach((r) => {
      if (!rangeMatches(r.inicioISO, dateFrom, dateTo)) return;
      const up = String(r.estado || '').toUpperCase();
      if (up === 'RESERVADO') base.P += 1;
      else if (up === 'CANCELADO') base.C += 1;
      else if (up === 'FINALIZADO') base.F += 1;
    });
    return base;
  }, [reservas, dateFrom, dateTo]);

  // === Aplicar filtros (estado + rango de fecha) ===
  const reservasFiltradas = reservas.filter((r) => {
    const estadoOk = filtro.startsWith('estado:')
      ? String(r.estado).toUpperCase() === filtro.split(':')[1]
      : true;
    const fechaOk = rangeMatches(r.inicioISO, dateFrom, dateTo);
    return estadoOk && fechaOk;
  });

  // Atajos de rango
  const setHoy = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const v = `${y}-${m}-${day}`;
    setDateFrom(v);
    setDateTo(v);
  };
  const setEsteMes = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDate = new Date(y, m, 0).getDate();
    const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
    setDateFrom(first);
    setDateTo(last);
  };
  const limpiarFechas = () => { setDateFrom(''); setDateTo(''); };

  /* ==================== Render ==================== */
  return (
    <>
      <GlobalFix />
      <main className="mr-page" ref={pageRef}>
        <div className="cf-bg">
          <div className="cf-container">
            {/* Banner / Header */}
            <header className="cf-header">
              <h1>📒 Mis reservas</h1>
              <p>Consulta y gestiona tus eventos y funciones privadas.</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:8 }}>
                <button className="cf-btn" onClick={() => navigate('/bienvenida-cliente')}>
                  ⬅️ Inicio
                </button>
                <button className="cf-btn cf-btn-primary" onClick={() => navigate('/reservar-evento')}>
                  🎉 Reservar evento
                </button>
                <button className="cf-btn" onClick={fetchReservas} title="Actualizar listados">
                  ↻ Actualizar
                </button>
                <button className="cf-btn" onClick={() => navigate('/mis-solicitudes')}>
                  📒 Ver mis solicitudes de reserva
                </button>
              </div>
            </header>

            {/* === RF06: Búsqueda por fecha (UI) === */}
            <section className="cf-search">
              <div className="row-grid">
                <div className="cf-field">
                  <label htmlFor="f-desde">Desde</label>
                  <input id="f-desde" type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} />
                </div>

                <div className="cf-field">
                  <label htmlFor="f-hasta">Hasta</label>
                  <input id="f-hasta" type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} />
                </div>

                <div className="toolbar">
                  <button className="cf-btn-mini" onClick={setHoy} title="Filtrar por hoy">Hoy</button>
                  <button className="cf-btn-mini" onClick={setEsteMes} title="Filtrar por el mes actual">Este mes</button>
                  <button className="cf-btn-mini" onClick={limpiarFechas} title="Quitar filtro de fechas">Limpiar</button>
                </div>
              </div>
            </section>

            {/* KPIs de estado (con rango de fechas aplicado) */}
            <div className="kpi-row">
              <div className="kpi-chip"><span className="kpi-dot kpi-p" /> Pendientes <span>·</span> <b>{kpi.P}</b></div>
              <div className="kpi-chip"><span className="kpi-dot kpi-c" /> Canceladas <span>·</span> <b>{kpi.C}</b></div>
              <div className="kpi-chip"><span className="kpi-dot kpi-f" /> Finalizadas <span>·</span> <b>{kpi.F}</b></div>
            </div>

            {/* Filtros por estado */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent:'center' }}>
              {[
                { key: 'todas', label: 'Todas' },
                { key: 'estado:RESERVADO', label: 'Pendientes' },   // mapea RESERVADO → Pendiente
                { key: 'estado:CANCELADO', label: 'Canceladas' },
                { key: 'estado:FINALIZADO', label: 'Finalizadas' },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`cf-btn ${filtro === f.key ? 'cf-btn-primary' : ''}`}
                  onClick={() => setFiltro(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Listado */}
            {loading ? (
              <div className="cf-evt-card">Cargando…</div>
            ) : err ? (
              <div className="cf-evt-card" style={{ color: 'red' }}>{err}</div>
            ) : reservasFiltradas.length === 0 ? (
              <div className="cf-evt-card">No hay reservas.</div>
            ) : (
              <div className="cf-grid" style={{ gap: 18 }}>
                {reservasFiltradas.map((r) => {
                  const disabled =
                    !r.puedeCancelar || String(r.estado).toUpperCase() === 'CANCELADO';
                  const mismaFecha = fmtFecha(r.inicioISO) === fmtFecha(r.finISO);
                  const esPendiente = String(r.estado).toUpperCase() === 'RESERVADO';

                  return (
                    <article key={r.id} className="cf-card" style={{ background: '#fff' }}>
                      <div style={{ padding: 16, color: '#111' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <strong style={{ color: '#111' }}>
                            {r.salaNombre || `Sala ${r.salaId}`}
                          </strong>
                          <EstadoBadge estado={r.estado} puedeCancelar={r.puedeCancelar} />
                        </div>

                        <div style={{ fontSize: 14, color: '#111', lineHeight: 1.6 }}>
                          <div>
                            Fecha{' '}
                            <b>
                              {mismaFecha
                                ? fmtFecha(r.inicioISO)
                                : `${fmtFecha(r.inicioISO)} → ${fmtFecha(r.finISO)}`}
                            </b>
                          </div>

                          <div>Inicio: <b>{fmtHoraFromISO(r.inicioISO)}</b></div>
                          <div>Fin: <b>{fmtHoraFromISO(r.finISO)}</b></div>
                          <div>Personas: <b>{r.personas ?? '-'}</b></div>
                          {r.notas ? <div>Notas: {cleanNotas(r.notas)}</div> : null}

                          {/* Aviso 24h para pendientes */}
                          {esPendiente && !r.puedeCancelar && (
                            <div style={{
                              marginTop: 10,
                              background: '#fff7ed',
                              border: '1px solid #fed7aa',
                              color: '#7c2d12',
                              padding: '8px 10px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 700
                            }}>
                              ⚠️ Esta reserva comienza en menos de 24 h; ya no puede cancelarse desde la web.
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setConfirmId(r.id)}
                          disabled={disabled}
                          className="cf-btn"
                          style={{
                            width: '100%',
                            marginTop: 12,
                            background: disabled ? '#e5e7eb' : '#ef4444',
                            color: disabled ? '#6b7280' : '#fff',
                            fontWeight: 700,
                          }}
                          title={
                            r.puedeCancelar
                              ? 'Cancelar reserva'
                              : 'Solo puede cancelarse hasta 24 h antes'
                          }
                        >
                          Cancelar reserva
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal */}
          {confirmId && (
            <div className="cf-modal" onClick={() => setConfirmId(null)}>
              <div className="cf-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="cf-close" onClick={() => setConfirmId(null)}>×</button>
                <div className="cf-modal-header">
                  <h2>Confirmar cancelación</h2>
                  <p>¿Seguro que quieres cancelar esta reserva?</p>
                </div>
                <div className="cf-modal-body" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="cf-btn" onClick={() => setConfirmId(null)}>No, volver</button>
                  <button className="cf-btn cf-btn-primary" onClick={confirmarCancelacion}>
                    {loadingCancel ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
