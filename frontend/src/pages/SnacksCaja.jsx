// src/pages/SnacksCaja.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/snacks-caja.css';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;

// ---------- helpers de red ----------
async function getJson(url, options = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- normalizadores ----------
const toStr = (v) => (v === undefined || v === null ? '' : String(v));

const normFuncion = (f) => {
  const id =
    f?.id ?? f?.ID ?? f?.id_funcion ?? f?.ID_FUNCION ?? f?.funcion_id ?? f?.FUNCION_ID ?? '';
  let sala =
    f?.salaNombre ?? f?.salaId ?? f?.SALAID ?? f?.sala_id ?? f?.SALA_ID ?? f?.id_sala ?? f?.ID_SALA ?? f?.sala ?? f?.SALA ?? '';
  const salaLabel = String(sala) === '9' ? 'A' : sala;
  const hIni =
    f?.horaInicio ?? f?.HORA_INICIO ?? f?.hora_ini ?? f?.HORA_INI ?? f?.inicio ?? f?.INICIO ?? '';
  const hFin =
    f?.horaFinal ?? f?.HORA_FINAL ?? f?.hora_fin ?? f?.HORA_FIN ?? f?.final ?? f?.FIN ?? '';
  return { id: toStr(id), salaId: toStr(salaLabel), horaInicio: toStr(hIni), horaFinal: toStr(hFin) };
};

const parseCreado = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = String(v).trim().replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const normPedido = (p) => {
  const isArr = Array.isArray(p);
  const id = isArr ? p[0] : (p?.id ?? p?.ID ?? p?.id_pedido ?? p?.ID_PEDIDO ?? p?.venta_id ?? p?.VENTA_ID ?? null);
  const cliente = isArr ? (p[1] ?? '—') :
    (p?.clienteNombre ?? p?.cliente_nombre ?? p?.nombre_cliente ?? p?.cliente ?? '—');
  const salaId = isArr ? p[2] : (p?.salaId ?? p?.SALA_ID ?? p?.sala ?? null);
  const asiento = isArr ? (p[3] ?? '—') :
    (p?.asiento ?? p?.ASIENTO ?? p?.butaca ?? p?.BUTACA ?? '—');
  const total = Number(isArr ? (p[4] ?? 0) :
    (p?.total ?? p?.TOTAL ?? p?.monto_total ?? p?.MONTO_TOTAL ?? 0));
  const efectivo = Number(isArr ? (p[5] ?? 0) :
    (p?.efectivo ?? p?.EFECTIVO ?? p?.dinero_recibido ?? p?.DINERO_RECIBIDO ?? 0));
  const cambio = Number(isArr ? (p[6] ?? 0) :
    (p?.cambio ?? p?.CAMBIO ?? p?.vuelto ?? p?.VUELTO ?? 0));
  const estado = isArr ? (p[7] ?? 'PENDIENTE') :
    (p?.estado ?? p?.ESTADO ?? p?.status ?? p?.STATUS ?? 'PENDIENTE');
  const creado = parseCreado(isArr ? p[8] : (p?.creado ?? p?.CREADO ?? p?.created_at ?? p?.CREATED_AT));
  return { id, clienteNombre: cliente || '—', salaId, asiento, total, efectivo, cambio, estado, creado };
};

export default function SnacksCaja() {
  const [funciones, setFunciones] = useState([]);
  const [selFuncionId, setSelFuncionId] = useState('');
  const [estado, setEstado] = useState('PENDIENTE'); // PENDIENTE|ACEPTADO|ENTREGADO|TODOS
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const estados = ['PENDIENTE', 'ACEPTADO', 'ENTREGADO'];
  const puedeAvanzar = (e) => e === 'PENDIENTE' || e === 'ACEPTADO';

  // Cargar funciones activas
  const loadFunciones = async () => {
    try {
      const data =
        (await getJson(`${API_BASE}/api/pedidos-snacks/funciones-activas`, { headers: authHeaders() })) ??
        (await getJson(`${API_BASE}/api/pedidos-snacks/funciones-activas`));
      const arr = Array.isArray(data) ? data : data?.items ?? [];
      const normalizadas = arr.map(normFuncion).filter((f) => f.id);
      setFunciones(normalizadas);
      if (!selFuncionId && normalizadas[0]?.id) setSelFuncionId(String(normalizadas[0].id));
    } catch {
      setFunciones([]);
    }
  };

  // Cargar pedidos por función/estado (SIN fallback a "TODOS": respeta el filtro)
  const fetchPedidos = async (funcionId, estadoParam) => {
    const qs = estadoParam && estadoParam !== 'TODOS' ? `?estado=${encodeURIComponent(estadoParam)}` : '';
    const data =
      (await getJson(`${API_BASE}/api/pedidos-snacks/por-funcion/${funcionId}${qs}`, { headers: authHeaders() })) ??
      (await getJson(`${API_BASE}/api/pedidos-snacks/por-funcion/${funcionId}${qs}`));
    const arr = Array.isArray(data) ? data : data?.items ?? [];
    return arr.map(normPedido).filter((x) => x.id !== null);
  };

  const loadPedidos = async () => {
    if (!selFuncionId) return;
    setLoading(true);
    try {
      const normalizados = await fetchPedidos(selFuncionId, estado);
      setItems(normalizados);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Cambiar estado: PENDIENTE -> ACEPTADO -> ENTREGADO
  const avanzar = async (id, current) => {
    const next = current === 'PENDIENTE' ? 'ACEPTADO' : 'ENTREGADO';
    try {
      const r = await fetch(`${API_BASE}/api/pedidos-snacks/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ estado: next }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadPedidos();
    } catch (e) {
      alert('No se pudo actualizar el estado: ' + (e?.message || 'Error'));
    }
  };

  // Abrir pdf del detalle
  const openPdf = (id) => {
    if (id == null || Number.isNaN(Number(id))) return;
    window.open(`${API_BASE}/api/pedidos-snacks/${id}/pdf`, '_blank');
  };

  // polling suave cada 5s
  useEffect(() => { loadFunciones(); }, []);
  useEffect(() => {
    loadPedidos();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(loadPedidos, 5000);
    return () => clearInterval(timerRef.current);
  }, [selFuncionId, estado]);

  const funcionSel = useMemo(
    () => funciones.find((f) => String(f.id) === String(selFuncionId)),
    [funciones, selFuncionId]
  );

  const fmtHora = (d) => (d instanceof Date ? d.toLocaleTimeString() : '—');

  return (
    <div className="sc-page">
      {/* Estilo de selects/option para que el texto sea legible en el desplegable */}
      <style>{`
        .sc-select {
          color-scheme: dark;
          background: rgba(255,255,255,.06);
          color: var(--sc-fg, #e8eef9);
          border: 1px solid rgba(255,255,255,.16);
        }
        .sc-select:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgba(130, 100, 255, .35);
        }
        .sc-select option {
          background: #0c121e;
          color: #e8eef9;
        }
      `}</style>

      <div className="sc-card">
        {/* ===== Encabezado ===== */}
        <div className="sc-header">
          <span className="sc-emoji">🍿</span>
          <div>
            <h2 className="sc-title">Caja · Pedidos de snacks</h2>
            <div className="sc-sub">Gestiona los pedidos por función: acepta y entrega.</div>
          </div>
        </div>

        {/* ===== Barra de filtros ===== */}
        <div className="sc-filters">
          <div className="sc-group">
            <span className="sc-label">Función activa</span>
            <select
              className="sc-select"
              value={selFuncionId}
              onChange={(e) => setSelFuncionId(e.target.value)}
            >
              {funciones.length === 0 && <option value="">— Sin funciones activas —</option>}
              {funciones.map((f) => (
                <option key={f.id} value={f.id}>
                  {`Sala ${f.salaId} · ${f.horaInicio} — ${f.horaFinal}`}
                </option>
              ))}
            </select>
          </div>

          <div className="sc-group">
            <span className="sc-label">Estado</span>
            <select
              className="sc-select"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="ACEPTADO">Aceptado</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="TODOS">Todos</option>
            </select>
          </div>

          <button className="sc-btn primary" onClick={loadPedidos}>Refrescar</button>
        </div>

        {/* Info función seleccionada */}
        {funcionSel && (
          <div style={{ marginTop: 4, marginBottom: 10, fontSize: 13, color: 'var(--sc-fg-muted)' }}>
            <strong style={{ color: 'var(--sc-fg)' }}>Función #{funcionSel.id}</strong>
            {' · '}Sala {funcionSel.salaId} · {funcionSel.horaInicio} — {funcionSel.horaFinal}
          </div>
        )}

        {/* ===== Tabla ===== */}
        <table className="sc-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Detalle</th>
              <th>Butaca</th>
              <th>Total / Efectivo / Cambio</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="sc-empty">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="6" className="sc-empty">No hay pedidos para los filtros seleccionados.</td></tr>
            ) : (
              items.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.clienteNombre || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--sc-fg-muted)' }}>
                      Estado: {p.estado} · Creado: {fmtHora(p.creado)}
                    </div>
                  </td>
                  <td>
                    <button className="sc-btn" onClick={() => openPdf(p.id)}>
                      Detalle
                    </button>
                  </td>
                  <td>{p.asiento || '—'}</td>
                  <td>
                    <div>{fmtQ(p.total)}</div>
                    <div style={{ fontSize: 12, color: 'var(--sc-fg-muted)' }}>
                      Efectivo: {fmtQ(p.efectivo)} · Cambio: {fmtQ(p.cambio)}
                    </div>
                  </td>
                  <td>
                    <div className="sc-row-actions">
                      {puedeAvanzar(p.estado) ? (
                        <button
                          className="sc-btn small success"
                          onClick={() => avanzar(p.id, p.estado)}
                          title={p.estado === 'PENDIENTE' ? 'Aceptar pedido' : 'Marcar como entregado'}
                        >
                          {p.estado === 'PENDIENTE' ? 'Aceptar' : 'Entregar'}
                        </button>
                      ) : (
                        <button className="sc-btn small ghost" disabled>Entregado</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
