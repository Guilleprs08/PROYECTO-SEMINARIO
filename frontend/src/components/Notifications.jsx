import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ==================== Estilos (incrustados) ==================== */
const Styles = () => (
  <style>{`
:root{
  --nf-bg:#0b0b12; --nf-card:#141428; --nf-text:#e6e6f0; --nf-muted:#a3a3b2;
  --nf-green:#14b87a; --nf-red:#ff5d6c; --nf-amber:#f5b301; --nf-border:rgba(255,255,255,.08);
  --nf-shadow:0 10px 30px rgba(0,0,0,.35);
}
.nf-portal{ all: initial; }
.nf-toast-wrap{ position: fixed; inset: 16px 16px auto auto; z-index: 9999; display: grid; gap: 10px; width: min(420px, calc(100vw - 24px)); font-family: ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,Arial; }
.nf-toast{
  background: var(--nf-card); color: var(--nf-text); border:1px solid var(--nf-border);
  border-radius: 14px; box-shadow: var(--nf-shadow); overflow: hidden; display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; padding: 12px 14px; align-items: center; transform: translateY(-6px);
  animation: nf-in .18s ease-out forwards;
}
@keyframes nf-in{to{transform: translateY(0); opacity:1}} @keyframes nf-out{to{transform: translateY(-6px); opacity:0}}
.nf-icon{ display: grid; place-items: center; width: 36px; height:36px; border-radius: 10px; font-size: 18px; }
.nf-title{ font-weight: 650; letter-spacing:.2px; }
.nf-desc{ color: var(--nf-muted); font-size: .925rem; margin-top: 2px; }
.nf-close{ background: transparent; border: none; color: #9da3b0; font-size: 18px; padding: 6px; cursor: pointer; border-radius: 8px;}
.nf-close:hover{ background: rgba(255,255,255,.04); color:#c9cdd6 }
.nf-variant-success .nf-icon{ background: rgba(20,184,122,.18); color: var(--nf-green); }
.nf-variant-error .nf-icon{ background: rgba(255,93,108,.18); color: var(--nf-red); }
.nf-variant-info .nf-icon{ background: rgba(245,179,1,.18); color: var(--nf-amber); }

.nf-modal-backdrop{ position: fixed; inset:0; background: rgba(2,6,23,.55); backdrop-filter: blur(2px); z-index: 9998; opacity: 0; animation: nf-in .15s ease-out forwards;}
.nf-modal{
  position: fixed; inset: 0; display: grid; place-items: center; z-index: 9999; font-family: ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Inter,Arial;
}
.nf-dialog{
  width: min(520px, calc(100vw - 28px));
  background: var(--nf-card); color: var(--nf-text); border: 1px solid var(--nf-border); border-radius: 18px; box-shadow: var(--nf-shadow);
  padding: 18px; transform: translateY(6px); opacity:.98; animation: nf-in .18s ease-out forwards;
}
.nf-head{ display:flex; gap:10px; align-items:center; }
.nf-head .nf-icon{ width:40px; height:40px; font-size:20px; }
.nf-h1{ font-weight: 700; font-size: 1.05rem; letter-spacing:.2px}
.nf-body{ margin: 6px 0 14px; color: var(--nf-muted); line-height: 1.45; }
.nf-actions{ display:flex; gap:10px; justify-content:flex-end; }
.nf-btn{
  appearance: none; border:1px solid var(--nf-border); background: #1a1a33; color: var(--nf-text);
  padding: 10px 14px; border-radius: 12px; cursor: pointer; font-weight: 600; letter-spacing:.2px;
}
.nf-btn:hover{ filter: brightness(1.05); }
.nf-btn.primary{ background: linear-gradient(180deg,#1dd3aa,#13b88b); border-color: transparent; color:#0c1715; }
.nf-btn.destructive{ background: #2a1420; border-color: rgba(255,93,108,.35); color:#ffd8dc }
.nf-btn.ghost{ background: #15152b; }
  `}</style>
);

/* ==================== Toasts ==================== */
const ToastCtx = createContext(null);

function useId() { return Math.random().toString(36).slice(2); }

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timeouts = useRef({});

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timeouts.current[id]) {
      clearTimeout(timeouts.current[id]);
      delete timeouts.current[id];
    }
  };

  const add = useCallback((t) => {
    const id = useId();
    const toast = { id, duration: 4200, variant: "info", ...t };
    setToasts((prev) => [toast, ...prev]);
    timeouts.current[id] = setTimeout(() => dismiss(id), toast.duration);
  }, []);

  const api = useMemo(
    () => ({
      success: (t) => add({ ...t, variant: "success" }),
      error: (t) => add({ ...t, variant: "error" }),
      info: (t) => add({ ...t, variant: "info" }),
      dismiss,
    }),
    [add]
  );

  useEffect(() => {
    return () => Object.values(timeouts.current).forEach(clearTimeout);
  }, []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="nf-portal">
          <Styles />
          <div className="nf-toast-wrap">
            {toasts.map((t) => (
              <div key={t.id} className={`nf-toast nf-variant-${t.variant}`}>
                <div className="nf-icon">
                  {t.variant === "success" ? "✔" : t.variant === "error" ? "⨯" : "ℹ"}
                </div>
                <div>
                  <div className="nf-title">{t.title}</div>
                  {t.description && <div className="nf-desc">{t.description}</div>}
                </div>
                <button aria-label="Cerrar" className="nf-close" onClick={() => api.dismiss(t.id)}>×</button>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast debe usarse dentro de <NotificationsProvider>");
  return ctx;
}

/* ==================== Confirm Dialog ==================== */
const ConfirmCtx = createContext(null);

const ConfirmHost = () => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState({});
  const resolver = useRef(null);

  // API interna para abrir el modal
  const openConfirm = (o) => {
    setOpts(o || {});
    setOpen(true);
    return new Promise((res) => {
      resolver.current = res;
    });
  };

  // Exponer la función al provider
  useEffect(() => {
    window.__nf_openConfirm = openConfirm;
    return () => { delete window.__nf_openConfirm; };
  }, []);

  const close = (value) => { setOpen(false); resolver.current && resolver.current(value); };

  const iconByIntent =
    opts.intent === "approve" ? {bg:"rgba(20,184,122,.18)", color:"var(--nf-green)", icon:"✔"} :
    opts.intent === "reject"  ? {bg:"rgba(255,93,108,.18)", color:"var(--nf-red)",   icon:"⨯"} :
                                {bg:"rgba(245,179,1,.18)",  color:"var(--nf-amber)", icon:"?"};

  if (!open) return null;

  return createPortal(
    <>
      <Styles />
      <div className="nf-modal-backdrop" onClick={() => close(false)} />
      <div className="nf-modal" role="dialog" aria-modal="true">
        <div className="nf-dialog">
          <div className="nf-head">
            <div className="nf-icon" style={{ background: iconByIntent.bg, color: iconByIntent.color }}>
              {iconByIntent.icon}
            </div>
            <div className="nf-h1">{opts.title ?? "¿Confirmar acción?"}</div>
          </div>
          <div className="nf-body">
            {opts.message ?? "Esta acción no se puede deshacer."}
          </div>
          <div className="nf-actions">
            <button className="nf-btn ghost" onClick={() => close(false)}>
              {opts.cancelText ?? "Cancelar"}
            </button>
            <button
              className={`nf-btn ${opts.intent === "reject" ? "destructive" : "primary"}`}
              onClick={() => close(true)}
            >
              {opts.confirmText ?? "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

const NotificationsProvider = ({ children }) => {
  // confirmFn se resuelve en tiempo de ejecución por ConfirmHost
  const confirmFn = (o) => window.__nf_openConfirm(o);

  return (
    <ToastProvider>
      <ConfirmCtx.Provider value={confirmFn}>
        {children}
        <ConfirmHost />
      </ConfirmCtx.Provider>
    </ToastProvider>
  );
};

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <NotificationsProvider>");
  return ctx;
}

export default NotificationsProvider;
