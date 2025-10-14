// src/pages/MisSolicitudes.jsx
import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/clientecartelera.css';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ====== Sesión ====== */
const getClienteId = () => {
  const v = localStorage.getItem('clienteId');
  return v ? Number(v) : null;
};
const getUserEmail = () => {
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
};
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/* ====== UI helpers ====== */
const pad2 = (n) => String(n).padStart(2, '0');
const fDate = (ts) => {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch { return '—'; }
};
const fHM = (ts) => {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch { return '—'; }
};
const clsBadge = (estado) => {
  const e = String(estado || '').toUpperCase();
  if (e === 'ACEPTADA') return 'cl-badge ok';
  if (e === 'RECHAZADA') return 'cl-badge no';
  return 'cl-badge pend';
};

const ESTADOS = ['TODAS', 'PENDIENTE', 'ACEPTADA', 'RECHAZADA'];

/* ==================== Componente ==================== */
export default function MisSolicitudes() {
  const navigate = useNavigate();

  // ====== Fix global de scroll (igual que MisReservas) ======
  const GlobalFix = () => (
    <style>{`
      html, body, #root { height:auto!important; min-height:100%!important; overflow-y:auto!important; overflow-x:hidden!important; }
      .ms-page { position:relative; display:block; min-height:100%!important; height:auto!important; overflow:visible!important; }
      body { margin:0!important; padding:0!important; }
    `}</style>
  );
  const pageRef = useRef(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, []);

  // ====== Identidad ======
  const clienteId = useMemo(getClienteId, []);
  const email = useMemo(getUserEmail, []);

  // ====== Estado UI/Data ======
  const [estado, setEstado] = useState('TODAS');
  const [busca, setBusca] = useState('');

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState('');

  const [motModal, setMotModal] = useState({ open: false, motivo: '', id: null });

  // ====== Carga de datos ======
  const fetchData = async () => {
    if (!clienteId && !email) {
      setErr('No se encontró sesión de cliente.');
      setItems([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (estado && estado !== 'TODAS') qs.set('estado', estado);
      if (clienteId) qs.set('clienteId', String(clienteId));
      if (email) qs.set('email', String(email));

      // Usamos solo Authorization en headers para evitar CORS preflight con headers custom
      const { data } = await axios.get(`${API_BASE}/api/solicitudes/mis?${qs.toString()}`, {
        headers: { ...authHeaders() },
      });

      const arr = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      setItems(arr);
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.detail || e?.message || 'Error al cargar tus solicitudes.');
      setItems([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [estado]);

  // ====== Filtro cliente ======
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const id = String(s.ID_SOLICITUD ?? '').toLowerCase();
      const sala = String(s.SALA_ID ?? '').toLowerCase();
      const nom = String(s.NOMBRE ?? '').toLowerCase();
      const cel = String(s.CELULAR ?? '').toLowerCase();
      const notas = String(s.NOTAS ?? '').toLowerCase();
      return id.includes(q) || sala.includes(q) || nom.includes(q) || cel.includes(q) || notas.includes(q);
    });
  }, [items, busca]);

  const counts = useMemo(() => {
    const c = { TODAS: items.length, PENDIENTE: 0, ACEPTADA: 0, RECHAZADA: 0 };
    items.forEach((s) => {
      const e = String(s.ESTADO || '').toUpperCase();
      if (e in c) c[e] += 1;
    });
    return c;
  }, [items]);

  const segBtn = (curr, val) => `seg-btn ${curr === val ? 'active' : ''}`;

  return (
    <>
      <GlobalFix />
      <main className="ms-page" ref={pageRef}>
        <div className="cf-bg">
          <div className="cf-container">
            {/* Header */}
            <header className="cf-header">
              <h1>📁 Mis solicitudes de reserva</h1>
              <p>Consulta el estado de las solicitudes que enviaste. Si alguna fue rechazada, podrás ver el motivo.</p>
            </header>

            {/* Controles */}
            <section className="ms-controls">
              <div className="seg">
                {ESTADOS.map((e) => (
                  <button key={e} className={segBtn(estado, e)} onClick={() => setEstado(e)}>
                    {e === 'PENDIENTE' && '⏳ '}
                    {e === 'ACEPTADA' && '✅ '}
                    {e === 'RECHAZADA' && '❌ '}
                    {e === 'TODAS' && '📋 '}
                    {e} <span className="pill">{counts[e] ?? 0}</span>
                  </button>
                ))}
              </div>

              <div className="ms-search">
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por ID, sala, nombre o notas…"
                />
                <button className="cf-btn" onClick={fetchData} disabled={cargando}>
                  ↻ Actualizar
                </button>
              </div>
            </section>

            {/* Tarjeta / Tabla */}
            <section className="ms-card">
              {err ? <div className="ms-error">{err}</div> : null}

              {cargando ? (
                <p>Cargando…</p>
              ) : (
                <div className="ms-table-wrap">
                  <table className="ms-table">
                    <thead>
                      <tr>
                        <th># Solicitud</th>
                        <th>Sala</th>
                        <th>Fecha</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th>Duración</th>
                        <th>Nombre</th>
                        <th>Celular</th>
                        <th>Estado</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={10} className="ms-empty">No hay solicitudes que coincidan.</td></tr>
                      ) : filtered.map((s) => (
                        <tr key={s.ID_SOLICITUD}>
                          <td className="mono">#{s.ID_SOLICITUD}</td>
                          <td>{s.SALA_ID}</td>
                          <td>{fDate(s.START_TS)}</td>
                          <td>{fHM(s.START_TS)}</td>
                          <td>{fHM(s.END_TS)}</td>
                          <td>{s.DURACION_MIN} min</td>
                          <td className="cut">{s.NOMBRE || '—'}</td>
                          <td className="mono">{s.CELULAR || '—'}</td>
                          <td><span className={clsBadge(s.ESTADO)}>{s.ESTADO}</span></td>
                          <td>
                            {String(s.ESTADO).toUpperCase() === 'RECHAZADA' && s.MOTIVO_RECHAZO ? (
                              <button
                                className="cf-btn"
                                onClick={() => setMotModal({ open: true, motivo: s.MOTIVO_RECHAZO, id: s.ID_SOLICITUD })}
                              >
                                Ver motivo
                              </button>
                            ) : <span className="ms-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Acciones inferiores */}
            <div className="ms-actions">
              <button className="cf-btn" onClick={() => navigate('/mis-reservas')}>⬅️ Volver a Mis reservas</button>
              <button className="cf-btn cf-btn-primary" onClick={() => navigate('/reservar-evento')}>🎬 Solicitar otra reserva</button>
            </div>
          </div>

          {/* Modal motivo rechazo */}
          {motModal.open && (
            <div className="cf-modal" onClick={() => setMotModal({ open: false, motivo: '', id: null })}>
              <div className="cf-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="cf-close" onClick={() => setMotModal({ open: false, motivo: '', id: null })}>×</button>
                <div className="cf-modal-header">
                  <h2>Motivo del rechazo — Solicitud #{motModal.id}</h2>
                </div>
                <div className="cf-modal-body">
                  <p className="ms-motivo">{motModal.motivo}</p>
                  <div style={{ textAlign: 'right' }}>
                    <button className="cf-btn" onClick={() => setMotModal({ open: false, motivo: '', id: null })}>Cerrar</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Estilos específicos (responsivo y sin romper scroll) */}
      <style>{`
        .ms-controls{
          display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; margin-bottom:8px;
        }
        /* Segmented */
        .seg { display:flex; gap:6px; background:#0b1320; border:1px solid #2a3b57; border-radius:12px; padding:4px; }
        .seg-btn { background:transparent; color:#bcd0ef; border:none; border-radius:9px; padding:8px 12px; cursor:pointer; font-weight:700; display:flex; align-items:center; gap:6px; }
        .seg-btn .pill { background:#13233e; border:1px solid #2d4778; color:#dce9ff; border-radius:999px; padding:2px 8px; font-size:11px; }
        .seg-btn:hover { color:#e9eef9; background:#12203a; }
        .seg-btn.active { background:linear-gradient(180deg,#233b66,#17294a); color:#fff; box-shadow:0 0 0 1px #345281 inset; }

        /* Buscador */
        .ms-search{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .ms-search input{
          background:#0b1320; border:1px solid #2a3b57; color:#e9eef9;
          border-radius:10px; padding:9px 12px; min-width:260px;
        }
        .ms-search input::placeholder{ color:#93a4c3; }

        /* Card / tabla */
        .ms-card{ background:#0d1424; border:1px solid #22314a; border-radius:16px; padding:16px; box-shadow:0 10px 28px rgba(0,0,0,.35); color:#e9eef9; margin-top:12px; }
        .ms-error{ background:#3a1020; border:1px solid #8a274e; color:#ffd7e1; padding:10px 12px; border-radius:10px; margin-bottom:10px; }

        /* wrapper con scroll solo horizontal si hace falta (vertical lo maneja la página) */
        .ms-table-wrap{ width:100%; overflow:auto; border-radius:12px; }
        table.ms-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .ms-table th, .ms-table td{ border-bottom:1px solid #22314a; padding:12px 10px; text-align:left; white-space:nowrap; }
        .ms-table th{ color:#bcd0ef; font-weight:700; background:#0a1020; position:sticky; top:0; z-index:1; }
        .ms-table tbody tr:hover{ background:#0f1a33; }
        .ms-empty{ text-align:center; padding:22px; color:#9fb3d3; }
        .ms-muted{ opacity:.7; font-size:12px; }
        .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .cut{ max-width: 240px; overflow: hidden; text-overflow: ellipsis; }

        .cl-badge{ padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; display:inline-block; letter-spacing:.2px; }
        .cl-badge.ok{ background:#0f2f20; color:#9fe6c1; border:1px solid #2b6b4d; }
        .cl-badge.no{ background:#361316; color:#ffb8c0; border:1px solid #6a2f3c; }
        .cl-badge.pend{ background:#2e260f; color:#ffd899; border:1px solid #6a5a2a; }

        .ms-actions{ display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; justify-content:center; }

        /* Modal motivo */
        .ms-motivo{ background:#2a1622; border:1px solid #6d2f3c; color:#ffd7e1; padding:10px 12px; border-radius:10px; white-space:pre-wrap; }

        @media (max-width: 980px){
          .ms-controls { flex-direction:column; align-items:stretch; }
          .seg { width:100%; justify-content:space-between; }
          .ms-search { justify-content:center; }
          .ms-search input { width:100%; min-width:unset; }
        }
      `}</style>
    </>
  );
}
