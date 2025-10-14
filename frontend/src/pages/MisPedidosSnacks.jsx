// src/pages/MisPedidosSnacks.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;

async function tryFetchJson(url, options = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== util: ids cancelados en localStorage (solo lado cliente) =====
const LS_KEY = "mf_cancelled_snack_ids";
const readCancelled = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const writeCancelled = (arr) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
};

// Normalizador (objeto o arreglo)
function normalizePedido(p) {
  if (Array.isArray(p)) {
    const [ID_PEDIDO, , , SALA_ID, ASIENTO_COD, TOTAL_GTQ, EFECTIVO_GTQ, CAMBIO_GTQ, ESTADO, CREATED_AT] = p;
    return {
      id: ID_PEDIDO ?? null,
      salaId: SALA_ID ?? null,
      asiento: ASIENTO_COD ?? null,
      total: Number(TOTAL_GTQ || 0),
      efectivo: Number(EFECTIVO_GTQ || 0),
      cambio: Number(CAMBIO_GTQ || 0),
      estado: ESTADO || "PENDIENTE",
      creado: CREATED_AT ?? null,
      items: [],
    };
  }
  const id = p?.id ?? p?.ID ?? p?.ID_PEDIDO ?? null;
  const salaId = p?.salaId ?? p?.SALA_ID ?? p?.sala ?? null;
  const asiento = p?.asiento ?? p?.asientoCod ?? p?.ASIENTO_COD ?? null;
  const total = p?.total ?? p?.totalGtq ?? p?.TOTAL_GTQ ?? 0;
  const efectivo = p?.efectivo ?? p?.efectivoGtq ?? p?.EFECTIVO_GTQ ?? 0;
  const cambio = p?.cambio ?? p?.cambioGtq ?? p?.CAMBIO_GTQ ?? 0;
  const estado = p?.estado ?? p?.ESTADO ?? "PENDIENTE";
  const creado = p?.creado ?? p?.createdAt ?? p?.CREATED_AT ?? p?.CREADO_STR ?? null;
  const items = Array.isArray(p?.items) ? p.items : [];
  return {
    id,
    salaId,
    asiento,
    total: Number(total || 0),
    efectivo: Number(efectivo || 0),
    cambio: Number(cambio || 0),
    estado,
    creado,
    items,
    salaNombre: p?.salaNombre ?? null,
  };
}

// 👉 Mapeo de sala visual
function salaDisplay(salaNombre, salaId) {
  if (salaNombre && String(salaNombre).trim() !== "") return `Sala ${salaNombre}`;
  if (salaId == null) return "Sala —";
  if (String(salaId) === "9") return "Sala A";
  return `Sala ${salaId}`;
}

export default function MisPedidosSnacks() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelledIds, setCancelledIds] = useState(readCancelled());
  const [toast, setToast] = useState(null); // {msg}
  const [confirmBox, setConfirmBox] = useState(null); // {id, titulo, mensaje}
  const [filtro, setFiltro] = useState("TODOS"); // TODOS | PENDIENTE | ACEPTADO | ENTREGADO

  const load = async () => {
    setLoading(true);
    let data = [];
    try {
      data = await tryFetchJson(`${API_BASE}/api/pedidos-snacks/mis`, { headers: authHeaders() });
    } catch {
      try {
        data = await tryFetchJson(`${API_BASE}/api/pedidos-snacks/mis`);
      } catch {}
    }
    setRaw(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    // 🔧 Forzar scroll completo en esta vista (por estilos globales que limitan)
    const prevOverflow = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = "auto";
    // Cargar y auto-refresh
    load();
    const id = setInterval(load, 10000);
    return () => {
      clearInterval(id);
      document.documentElement.style.overflowY = prevOverflow || "";
    };
  }, []);

  // Normaliza y quita cancelados locales
  const items = useMemo(() => {
    const norm = raw.map(normalizePedido);
    if (!cancelledIds?.length) return norm;
    const s = new Set(cancelledIds);
    return norm.filter((x) => !s.has(Number(x.id)));
  }, [raw, cancelledIds]);

  // Aplica filtro de estado seleccionado
  const visibles = useMemo(() => {
    const F = String(filtro).toUpperCase();
    if (F === "TODOS") return items;
    return items.filter((p) => String(p.estado).toUpperCase() === F);
  }, [items, filtro]);

  const openPdf = (id) => {
    if (id == null || Number.isNaN(Number(id))) {
      alert("No se pudo abrir el comprobante: ID inválido.");
      return;
    }
    window.open(`${API_BASE}/api/pedidos-snacks/${id}/pdf`, "_blank");
  };

  // ===== cancelar (con confirm modal), solo lado cliente =====
  const pedirConfirmacionCancel = (p) => {
    if (!p || String(p.estado).toUpperCase() !== "PENDIENTE") return;
    setConfirmBox({
      id: p.id,
      titulo: "Cancelar pedido",
      mensaje: `¿Seguro que deseas cancelar el Pedido #${p.id}?`,
    });
  };

  const confirmarCancelacion = () => {
    if (!confirmBox?.id) return;
    const idNum = Number(confirmBox.id);
    const next = Array.from(new Set([...(cancelledIds || []), idNum]));
    setCancelledIds(next);
    writeCancelled(next);
    setConfirmBox(null);
    setToast({ msg: "Pedido eliminado" });
    setTimeout(() => setToast(null), 2500);
  };

  const cerrarConfirm = () => setConfirmBox(null);

  return (
    <main className="wc-page">
      <style>{`
        /* ======= FIX DE SCROLL GLOBAL PARA ESTA PÁGINA ======= */
        html, body {
          height: auto !important;
          min-height: 100%;
          overflow-y: auto !important;
        }
        .wc-page {
          min-height: 100dvh;
          overflow: visible !important;
        }
        /* ======= Estilos propios ======= */
        .mps-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .mps-actions { margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
        .pill { font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); }
        .mps-grid { display:grid; gap:16px; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); }
        .mps-card { border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 16px; background: rgba(12,18,30,.6); }
        .mps-row { display:grid; gap:12px; grid-template-columns: 1fr auto; align-items:center; }
        .mps-meta { display:flex; gap:14px; flex-wrap:wrap; opacity:.85; font-size:13px; }
        .mps-btns { display:flex; gap:10px; flex-direction:column; align-items:stretch; justify-content:center; }
        .mps-btns .wc-btn { width: 150px; } /* ancho cómodo; opcional */
        @media (max-width: 420px) { .mps-row { grid-template-columns: 1fr; } .mps-btns .wc-btn { width: 100%; } }

        /* Filtros de estado */
        .mps-filters { display:flex; gap:8px; flex-wrap:wrap; margin: 10px 0 18px; }
        .mps-filters .is-active { box-shadow: 0 0 0 2px rgba(130,100,255,.35) inset; }

        /* Toast ligerito */
        .mps-toast-wrap { position: fixed; top: 18px; left:0; right:0; display:flex; justify-content:center; z-index: 10000; pointer-events:none; }
        .mps-toast { pointer-events:auto; background: rgba(26,40,24,.92); color:#e8ffe8; border:1px solid rgba(120,200,120,.4); padding:10px 14px; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.4); }

        /* Confirm modal */
        .mps-backdrop {
          position: fixed; inset: 0; display: grid; place-items: center;
          background: color-mix(in oklab, #000 55%, transparent);
          backdrop-filter: blur(4px);
          z-index: 10000;
          animation: mpsFade .18s ease-out;
        }
        @keyframes mpsFade { from { opacity: 0 } to { opacity: 1 } }
        .mps-dialog {
          width: min(520px, 92vw);
          border-radius: 16px;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03));
          border: 1px solid rgba(255,255,255,.08);
          box-shadow: 0 22px 68px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .mps-dialog-head { padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,.06); }
        .mps-dialog-title { margin:0; font-size:18px; font-weight:700; }
        .mps-dialog-body { padding: 16px 18px; }
        .mps-dialog-actions { display:flex; justify-content:flex-end; gap:10px; padding: 12px 18px; border-top:1px solid rgba(255,255,255,.06); }
      `}</style>

      {/* Toast de “Pedido eliminado” */}
      {toast?.msg && (
        <div className="mps-toast-wrap">
          <div className="mps-toast">{toast.msg}</div>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirmBox && (
        <div className="mps-backdrop" role="dialog" aria-modal="true" onClick={cerrarConfirm}>
          <div className="mps-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="mps-dialog-head">
              <h3 className="mps-dialog-title">🗑 {confirmBox.titulo}</h3>
            </div>
            <div className="mps-dialog-body">
              <p style={{ margin: 0 }}>{confirmBox.mensaje}</p>
            </div>
            <div className="mps-dialog-actions">
              <button className="wc-btn wc-btn-ghost" onClick={cerrarConfirm}>No, volver</button>
              <button className="wc-btn wc-btn-primary" onClick={confirmarCancelacion}>
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="wc-section">
        <div className="wc-container">
          <div className="wc-section-head mps-head">
            <div>
              <h2 style={{ marginBottom: 4 }}>📒 Mis pedidos de snacks</h2>
              <p style={{ margin: 0, opacity: 0.85 }}>
                Revisa el estado y vuelve a abrir tu comprobante.
              </p>
            </div>
            <div className="mps-actions">
              <button className="wc-btn wc-btn-primary" onClick={() => navigate("/snacks")}>
                🛒 Realizar pedido
              </button>
              <span className="pill">Total: {items.length}</span>
              <button className="wc-btn" onClick={load}>Actualizar</button>
            </div>
          </div>

          {/* Filtros de estado */}
          <div className="mps-filters">
            {[
              ["TODOS", "Todos"],
              ["PENDIENTE", "Pendientes"],
              ["ACEPTADO", "Aceptados"],
              ["ENTREGADO", "Entregados"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`wc-btn ${filtro === key ? "is-active" : ""}`}
                onClick={() => setFiltro(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mps-grid">
            {loading ? (
              <div className="mps-card">Cargando…</div>
            ) : visibles.length === 0 ? (
              <div className="mps-card" style={{ opacity: 0.8 }}>
                No hay pedidos para el filtro seleccionado.
              </div>
            ) : (
              visibles.map((p) => (
                <article key={`${p.id ?? Math.random()}`} className="mps-card">
                  <div className="mps-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 16 }}>Pedido #{p.id ?? "—"}</strong>
                        <span className="pill">{p.estado}</span>
                      </div>
                      <div className="mps-meta">
                        <span>{salaDisplay(p.salaNombre, p.salaId)}</span>
                        <span>Asiento {p.asiento ?? "—"}</span>
                        <span>Total {fmtQ(p.total)}</span>
                        {p.creado && <span>{String(p.creado).replace("T", " ").slice(0, 16)}</span>}
                      </div>
                    </div>
                    <div className="mps-btns">
                      <button className="wc-btn" onClick={() => openPdf(p.id)}>
                        Ver PDF
                      </button>
                      {String(p.estado).toUpperCase() === "PENDIENTE" && (
                        <button className="wc-btn" onClick={() => pedirConfirmacionCancel(p)}>
                          Cancelar pedido
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
