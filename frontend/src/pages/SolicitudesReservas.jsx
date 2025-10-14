// src/pages/SolicitudesReservas.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useToast, useConfirm } from '../components/Notifications';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ===== Auth / Axios helpers ===== */
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const get = (p, cfg = {}) =>
  axios.get(`${API_BASE}${p}`, {
    ...cfg,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
  });
const patch = (p, data = {}, cfg = {}) =>
  axios.patch(`${API_BASE}${p}`, data, {
    ...cfg,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(cfg.headers || {}) },
  });

/* ===== Helpers ===== */
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (ts) => {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch { return '—'; }
};
const fmtHM = (ts) => {
  try {
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch { return '—'; }
};
const badgeClass = (estado) => {
  const e = String(estado || '').toUpperCase();
  if (e === 'ACEPTADA') return 'adm-badge success';
  if (e === 'RECHAZADA') return 'adm-badge danger';
  return 'adm-badge warn';
};

export default function SolicitudesReservas() {
  const toast = useToast();
  const confirm = useConfirm();

  // Filtros
  const [estado, setEstado] = useState('PENDIENTE');
  const [search, setSearch] = useState('');
  // Datos
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Modal rechazar
  const [rejOpen, setRejOpen] = useState(false);
  const [rejId, setRejId] = useState(null);
  const [rejMotivo, setRejMotivo] = useState('');
  const [rejSaving, setRejSaving] = useState(false);

  // Paginación simple (cliente)
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchData = async () => {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams({});
      if (estado) qs.set('estado', estado);
      const { data } = await get(`/api/solicitudes?${qs.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(1);
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.detail || e?.message || 'Error cargando solicitudes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [estado]);

  // Filtrado por búsqueda local
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const sala = String(s.SALA_ID ?? '').toLowerCase();
      const nom = String(s.NOMBRE ?? '').toLowerCase();
      const cel = String(s.CELULAR ?? '').toLowerCase();
      const notas = String(s.NOTAS ?? '').toLowerCase();
      const id = String(s.ID_SOLICITUD ?? '').toLowerCase();
      return sala.includes(q) || nom.includes(q) || cel.includes(q) || notas.includes(q) || id === q;
    });
  }, [items, search]);

  // Paginación
  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  /* ===== Acciones ===== */
  const aprobar = async (id) => {
    const ok = await confirm({
      title: `¿Aprobar la solicitud #${id}?`,
      message: "Esto creará el evento real si pasa las validaciones (solapes y 3 días).",
      confirmText: "Aprobar",
      cancelText: "Cancelar",
      intent: "approve",
    });
    if (!ok) {
      toast.info({ title: "Operación cancelada", description: `La solicitud #${id} no fue aprobada.` });
      return;
    }
    try {
      await patch(`/api/solicitudes/${id}/aprobar`);
      toast.success({ title: "Solicitud aprobada", description: `Se creó el evento para la solicitud #${id}.` });
      fetchData();
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.detail || e?.message || 'No se pudo aprobar';
      toast.error({ title: "Error al aprobar", description: msg });
    }
  };

  const abrirRechazo = (id) => {
    setRejId(id);
    setRejMotivo('');
    setRejOpen(true);
  };

  const confirmarRechazo = async () => {
    if (!rejId) return;
    if (!rejMotivo.trim()) {
      toast.info({ title: "Motivo requerido", description: "Escribe el motivo del rechazo." });
      return;
    }
    try {
      setRejSaving(true);
      await patch(`/api/solicitudes/${rejId}/rechazar`, { motivo: rejMotivo.trim() });
      setRejOpen(false);
      setRejId(null);
      setRejMotivo('');
      toast.info({ title: "Solicitud rechazada", description: `La solicitud #${rejId} fue rechazada.` });
      fetchData();
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.detail || e?.message || 'No se pudo rechazar';
      toast.error({ title: "Error al rechazar", description: msg });
    } finally {
      setRejSaving(false);
    }
  };

  const segBtn = (val) => `seg-btn ${estado === val ? 'active' : ''}`;

  return (
    <div className="adm-wrap">
      <header className="adm-header">
        <div>
          <h1 className="adm-title">
            <span className="adm-title-ico">📝</span> Solicitudes de Reserva
          </h1>
          <p className="adm-sub">
            Administra las solicitudes enviadas por clientes. Puedes <b>aprobar</b> (crea evento) o <b>rechazar</b> (requiere motivo).
          </p>
        </div>

        {/* Controles */}
        <div className="adm-controls">
          {/* Filtro segmented, más amigable */}
          <div className="seg">
            <button className={segBtn('PENDIENTE')} onClick={() => setEstado('PENDIENTE')} title="Ver pendientes">⏳ Pendientes</button>
            <button className={segBtn('ACEPTADA')} onClick={() => setEstado('ACEPTADA')} title="Ver aceptadas">✅ Aceptadas</button>
            <button className={segBtn('RECHAZADA')} onClick={() => setEstado('RECHAZADA')} title="Ver rechazadas">❌ Rechazadas</button>
          </div>

          {/* Buscador */}
          <input
            className="adm-input"
            type="text"
            placeholder="Buscar por ID, nombre, celular o notas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Actualizar */}
          <button className="adm-btn primary" onClick={fetchData} disabled={loading}>
            <i className="fa fa-rotate" style={{ marginRight: 6 }} /> Actualizar
          </button>
        </div>
      </header>

      <section className="adm-card">
        {err ? <div className="adm-error">{err}</div> : null}
        {loading ? (
          <p>Cargando…</p>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Sala</th>
                    <th>Fecha</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Duración</th>
                    <th>Nombre</th>
                    <th>Celular</th>
                    <th>Personas</th>
                    <th>Estado</th>
                    <th style={{ minWidth: 220 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr><td colSpan={11} className="adm-empty">Sin resultados</td></tr>
                  ) : pageItems.map((s) => (
                    <tr key={s.ID_SOLICITUD}>
                      <td className="mono">#{s.ID_SOLICITUD}</td>
                      <td>{s.SALA_ID}</td>
                      <td>{fmtDate(s.START_TS)}</td>
                      <td>{fmtHM(s.START_TS)}</td>
                      <td>{fmtHM(s.END_TS)}</td>
                      <td>{s.DURACION_MIN} min</td>
                      <td className="cut">{s.NOMBRE || '—'}</td>
                      <td className="mono">{s.CELULAR || '—'}</td>
                      <td>{s.PERSONAS ?? '—'}</td>
                      <td>
                        <span className={badgeClass(s.ESTADO)}>{s.ESTADO}</span>
                        {s.ESTADO === 'RECHAZADA' && s.MOTIVO_RECHAZO ? (
                          <div title={s.MOTIVO_RECHAZO} className="motivo">
                            Motivo: {s.MOTIVO_RECHAZO}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {s.ESTADO === 'PENDIENTE' ? (
                          <div className="adm-row-actions">
                            <button className="adm-btn success" onClick={() => aprobar(s.ID_SOLICITUD)}>
                              <i className="fa fa-check" style={{ marginRight: 6 }} /> Aprobar
                            </button>
                            <button className="adm-btn danger" onClick={() => abrirRechazo(s.ID_SOLICITUD)}>
                              <i className="fa fa-xmark" style={{ marginRight: 6 }} /> Rechazar
                            </button>
                          </div>
                        ) : s.ESTADO === 'ACEPTADA' ? (
                          <span className="adm-muted">Evento #{s.EVENTO_ID || '—'}</span>
                        ) : (
                          <span className="adm-muted">Sin acciones</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="adm-pager">
              <button className="adm-btn" onClick={() => setPage(1)} disabled={page <= 1}>⏮</button>
              <button className="adm-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>◀</button>
              <span>Página {page} / {lastPage}</span>
              <button className="adm-btn" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page >= lastPage}>▶</button>
              <button className="adm-btn" onClick={() => setPage(lastPage)} disabled={page >= lastPage}>⏭</button>
              <span className="adm-muted" style={{ marginLeft: 12 }}>{total} resultados</span>
            </div>
          </>
        )}
      </section>

      {/* Modal Rechazar */}
      {rejOpen && (
        <div className="adm-modal" onClick={() => setRejOpen(false)}>
          <div className="adm-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="adm-close" onClick={() => setRejOpen(false)}>×</button>
            <h2>Rechazar solicitud #{rejId}</h2>
            <p>Escribe el motivo del rechazo. Este mensaje podrá verlo el cliente.</p>
            <textarea
              rows={4}
              placeholder="Motivo del rechazo…"
              value={rejMotivo}
              onChange={(e) => setRejMotivo(e.target.value)}
              className="adm-textarea"
            />
            <div className="modal-actions">
              <button className="adm-btn danger" onClick={confirmarRechazo} disabled={rejSaving}>
                {rejSaving ? 'Guardando…' : 'Confirmar rechazo'}
              </button>
              <button className="adm-btn" onClick={() => setRejOpen(false)} disabled={rejSaving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Estilos mejorados */}
      <style>{`
        /* ====== Colores base ====== */
        .adm-wrap { padding: 18px; color: #0f172a; }
        .adm-title { display:flex; align-items:center; gap:10px; font-size:28px; font-weight:800; letter-spacing:.3px; color:#0f172a; }
        .adm-title-ico { font-size:26px; }
        .adm-sub { margin:.25rem 0 0; color:#334155; max-width:860px; }

        .adm-controls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; }
        .adm-input { background:#0b1320; border:1px solid #2a3b57; color:#e9eef9; border-radius:10px; padding:9px 12px; min-width:260px; }
        .adm-input::placeholder { color:#93a4c3; }

        /* Segmented filter */
        .seg { background:#0b1320; border:1px solid #2a3b57; border-radius:12px; padding:4px; display:flex; gap:4px; }
        .seg-btn { background:transparent; color:#bcd0ef; border:none; border-radius:9px; padding:8px 12px; cursor:pointer; font-weight:600; }
        .seg-btn:hover { color:#e9eef9; background:#12203a; }
        .seg-btn.active { background:linear-gradient(180deg,#233b66,#17294a); color:#ffffff; box-shadow:0 0 0 1px #345281 inset; }

        /* Card */
        .adm-card { background:#0d1424; border:1px solid #22314a; border-radius:16px; padding:16px; box-shadow:0 10px 28px rgba(0,0,0,.35); margin-top:14px; color:#e9eef9; }
        .adm-error { background:#3a1020; border:1px solid #8a274e; color:#ffd7e1; padding:10px 12px; border-radius:10px; margin-bottom:10px; }

        .adm-table-wrap{ width:100%; overflow:auto; border-radius:12px; }
        table.adm-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .adm-table th, .adm-table td{ border-bottom:1px solid #22314a; padding:12px 10px; text-align:left; white-space:nowrap; }
        .adm-table th{ color:#bcd0ef; font-weight:700; background:#0a1020; position:sticky; top:0; z-index:1; }
        .adm-table tbody tr:hover { background:#0f1a33; }
        .adm-empty { text-align:center; padding:22px; color:#9fb3d3; }

        .adm-row-actions{ display:flex; gap:8px; flex-wrap:wrap; }
        .adm-btn{ background:#203259; color:#e9eef9; border:1px solid #2f4a7a; border-radius:10px; padding:8px 12px; cursor:pointer; }
        .adm-btn:hover{ filter:brightness(1.08); }
        .adm-btn.success{ background:#1d3a2a; border-color:#2f6d4d; }
        .adm-btn.danger{ background:#3a1d24; border-color:#6d2f3c; }
        .adm-btn.primary{ background:#203863; border-color:#2f538e; }
        .adm-muted{ opacity:.75; font-size:12px; }

        .adm-badge{ padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; letter-spacing:.2px; display:inline-block; }
        .adm-badge.success{ background:#0f2f20; color:#9fe6c1; border:1px solid #2b6b4d; }
        .adm-badge.danger{ background:#361316; color:#ffb8c0; border:1px solid #6a2f3c; }
        .adm-badge.warn{ background:#2e260f; color:#ffd899; border:1px solid #6a5a2a; }

        .motivo { font-size:12px; opacity:.9; margin-top:6px; color:#ffc6c6; }

        .adm-pager{ display:flex; align-items:center; gap:8px; padding-top:12px; color:#c7d6ef; }
        .adm-pager .adm-btn { background:#0b1320; border-color:#2a3b57; }

        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .cut { max-width: 240px; overflow: hidden; text-overflow: ellipsis; }

        /* Modal */
        .adm-modal{ position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:50; }
        .adm-modal-content{ background:#0f1528; color:#e9eef9; border:1px solid #22314a; padding:18px; border-radius:16px; width:min(560px, 92vw); box-shadow:0 12px 36px rgba(0,0,0,.5); }
        .adm-close{ float:right; background:transparent; border:none; color:#e9eef9; font-size:22px; cursor:pointer; }
        .adm-textarea{ width:100%; background:#0b1320; border:1px solid #2a3b57; color:#e9eef9; border-radius:10px; padding:10px; }
        .adm-textarea::placeholder{ color:#9ab0d3; }
        .modal-actions{ display:flex; gap:8px; margin-top:12px; }

        @media (max-width: 980px){
            .adm-controls { flex-direction:column; align-items:stretch; }
            .seg { width:100%; justify-content:space-between; }
            .adm-input { width:100%; min-width:unset; }
        }
      `}</style>
    </div>
  );
}
