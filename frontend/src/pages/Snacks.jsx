// src/pages/Snacks.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ===== Helpers ===== */
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtQ = (n) => `Q ${Number(n || 0).toFixed(2)}`;

// fetch JSON con opciones (headers, etc.)
async function tryFetchJson(url, options = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normalizeProducto(p) {
  const id =
    p.ID ?? p.id ?? p.ID_PRODUCTO ?? p.id_producto ?? p.ID_PROD ?? p.id_prod;
  const nombre =
    p.NOMBRE ?? p.nombre ?? p.descripcion ?? p.descripcion_corta ?? 'Producto';
  const precio =
    p.PRECIO_VENTA ?? p.precio_venta ?? p.precio ?? p.PRECIO ?? p.precioVenta ?? 0;
  const img = p.IMAGEN_URL ?? p.imagen_url ?? p.imagen ?? p.foto ?? null;
  return { tipo: 'PRODUCTO', id, nombre, precio: Number(precio || 0), img };
}

function normalizeCombo(c) {
  const id = c.ID ?? c.id ?? c.combo_id;
  const nombre = c.NOMBRE ?? c.nombre ?? 'Combo';
  const precio = c.PRECIO_VENTA ?? c.precio_venta ?? c.precio ?? 0;
  const img = c.IMAGEN_URL ?? c.imagen_url ?? c.imagen ?? c.foto ?? null;
  return { tipo: 'COMBO', id, nombre, precio: Number(precio || 0), img };
}

// id estable cuando falte
const stableId = (s) =>
  ('f_' +
    Math.abs(
      Array.from(String(s || 'x')).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
    ).toString(36));

// 18:30 — 21:30 bonito
const fmtHora = (v) => {
  try {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(v))) return String(v).slice(0, 5);
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {}
  return v ?? '';
};

function normalizeFuncion(f) {
  const id =
    f.id ?? f.ID ?? f.id_funcion ?? f.ID_FUNCION ?? f.funcion_id ?? f.FuncionID;

  const salaId =
    f.salaId ?? f.SALA_ID ?? f.id_sala ?? f.ID_SALA ?? f.sala_id ?? f.sala?.id;

  const salaNombre =
    f.salaNombre ?? f.SALA_NOMBRE ?? f.sala_nombre ?? f.salaName ?? f.sala?.nombre ?? '';

  const horaInicio =
    f.horaInicio ?? f.HORA_INICIO_TX ?? f.hora_inicio ?? f.inicio ?? f.fechaHoraInicio ?? f.startTime;

  const horaFin =
    f.horaFinal ?? f.HORA_FINAL_TX ?? f.horaFin ?? f.hora_fin ?? f.fin ?? f.fechaHoraFin ?? f.endTime;

  const titulo =
    f.titulo ?? f.TITULO ?? f.pelicula ?? f.pelicula_titulo ?? f.movie?.titulo ?? '';

  return { id, salaId, salaNombre, horaInicio, horaFin, titulo };
}

// etiqueta amigable para el <option>
const labelFuncion = (f) => {
  const sala = f.salaNombre || f.salaId || '—';
  const horas = f.horaInicio || f.horaFin ? `${fmtHora(f.horaInicio)} — ${fmtHora(f.horaFin)}` : '';
  return `${f.titulo ? `${f.titulo} · ` : ''}Sala ${sala}${horas ? ` · ${horas}` : ''}`;
};

/* ===== Candidatos de imagen (productos/combos) ===== */
const toAbs = (p) => (p?.startsWith('http') ? p : `${API_BASE}${p?.startsWith('/') ? p : '/' + p}`);

const getImgCandidates = (it) => {
  const list = [];
  if (it.img) list.push(toAbs(it.img));
  if (it.tipo === 'PRODUCTO') {
    list.push(`${API_BASE}/api/productos/${it.id}/imagen`);
    // respaldo adicional por si en algún entorno se expone por personal-ventas
    list.push(`${API_BASE}/api/personal-ventas/productos/${it.id}/imagen`);
  } else if (it.tipo === 'COMBO') {
    list.push(`${API_BASE}/api/combos/${it.id}/imagen`);
  }
  return Array.from(new Set(list.filter(Boolean)));
};

export default function Snacks() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('TODOS'); // TODOS | PRODUCTOS | COMBOS
  const [productos, setProductos] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState([]); // {tipo, id, nombre, precio, qty}
  const total = useMemo(
    () => cart.reduce((s, it) => s + it.precio * it.qty, 0),
    [cart]
  );

  // Modal
  const [show, setShow] = useState(false);
  const [funciones, setFunciones] = useState([]);
  const [selFuncion, setSelFuncion] = useState(null);
  const [butaca, setButaca] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [efectivo, setEfectivo] = useState('');

  // Avisos
  const [notice, setNotice] = useState(null); // { title, msg }
  const [toast, setToast] = useState(null);   // { title, msg, type }
  const toastTimer = useRef(null);
  const showToast = (payload) => {
    setToast(payload);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  const notify = (title, msg) => setNotice({ title, msg });

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Productos
      const prodUrls = [`${API_BASE}/api/pedidos-snacks/catalogo/productos`];
      let prod = null;
      for (const u of prodUrls) {
        try { prod = await tryFetchJson(u, { headers: authHeaders() }); }
        catch { try { prod = await tryFetchJson(u); } catch {} }
        if (Array.isArray(prod) && prod.length) break;
      }
      const normP = (Array.isArray(prod) ? prod : []).map(normalizeProducto);

      // Combos
      const comboUrls = [`${API_BASE}/api/pedidos-snacks/catalogo/combos`];
      let cmb = null;
      for (const u of comboUrls) {
        try { cmb = await tryFetchJson(u, { headers: authHeaders() }); }
        catch { try { cmb = await tryFetchJson(u); } catch {} }
        if (Array.isArray(cmb) && cmb.length) break;
      }
      const normC = (Array.isArray(cmb) ? cmb : []).map(normalizeCombo);

      setProductos(normP);
      setCombos(normC);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (tab === 'PRODUCTOS') return productos;
    if (tab === 'COMBOS') return combos;
    return [...productos, ...combos];
  }, [tab, productos, combos]);

  const addToCart = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.tipo === item.tipo && x.id === item.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const decQty = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.tipo === item.tipo && x.id === item.id);
      if (idx < 0) return prev;
      const copy = [...prev];
      const q = copy[idx].qty - 1;
      if (q <= 0) copy.splice(idx, 1);
      else copy[idx] = { ...copy[idx], qty: q };
      return copy;
    });
  };

  const clearCart = () => setCart([]);

  const openModal = async () => {
    if (cart.length === 0) {
      notify('Carrito vacío', 'Agrega al menos 1 producto o combo.');
      return;
    }
    const url = `${API_BASE}/api/pedidos-snacks/funciones-activas`;
    let data = [];
    try { data = await tryFetchJson(url, { headers: authHeaders() }); }
    catch { try { data = await tryFetchJson(url); } catch {} }

    const rows = Array.isArray(data) ? data.filter(x => x && Object.keys(x).length) : [];
    const normF = rows.map(normalizeFuncion);

    if (!normF.length) {
      notify('Sin funciones activas', 'Actualmente no existen funciones activas.');
      return;
    }

    setFunciones(normF);
    setSelFuncion(null);
    setButaca('');
    setClienteNombre(() => {
      try {
        const raw = localStorage.getItem('mf_user');
        if (raw) {
          const u = JSON.parse(raw);
          return u?.name || u?.nombre || u?.given_name || '';
        }
      } catch {}
      return '';
    });
    setEfectivo(total.toFixed(2));
    setShow(true);
  };

  const closeModal = () => setShow(false);

  const submitPedido = async () => {
    if (!selFuncion) return notify('Falta seleccionar función', 'Selecciona tu función activa.');
    if (!butaca?.trim()) return notify('Butaca requerida', 'Ingresa tu butaca (por ejemplo: B12).');
    if (!clienteNombre?.trim()) return notify('Nombre requerido', 'Ingresa tu nombre.');

    const efectivoNum = Number(efectivo);
    if (Number.isNaN(efectivoNum) || efectivoNum < total) {
      return notify(
        'Efectivo insuficiente',
        `Debe ser un número válido y cubrir el total de ${fmtQ(total)}.`
      );
    }

    const items = cart.map((i) => ({ tipo: i.tipo, id: i.id, cantidad: i.qty }));

    const body = {
      clienteNombre,
      funcionId: selFuncion.id,
      salaId: selFuncion.salaId,
      asientoCod: butaca.trim().toUpperCase(),
      items,
      totalGtq: Number(total.toFixed(2)),
      efectivoGtq: Number(efectivoNum.toFixed(2)),
    };

    try {
      const r = await fetch(`${API_BASE}/api/pedidos-snacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        let msg = 'No se pudo crear el pedido';
        try {
          const err = await r.json();
          if (err?.message) msg = err.message;
        } catch {
          try { msg = await r.text(); } catch {}
        }
        notify('No se puede crear el pedido', msg);
        return;
      }

      const data = await r.json();

      showToast({
        type: 'success',
        title: 'Pedido realizado',
        msg: 'Tu pedido fue enviado a la dulcería.',
      });

      setShow(false);
      clearCart();

      window.open(`${API_BASE}/api/pedidos-snacks/${data.idPedido}/pdf`, '_blank');
    } catch (e) {
      notify('No se puede crear el pedido', e?.message || 'Ocurrió un error inesperado.');
    }
  };

  return (
    <main className="wc-page" style={{ paddingBottom: 24 }}>
      <style>{`
        /* Toolbar */
        .snx-toolbar {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          padding: 12px 14px; border:1px solid rgba(255,255,255,.08);
          border-radius: 14px; background: linear-gradient(180deg, rgba(255,255,255,.03), transparent);
        }
        .snx-toolbar .spacer { flex:1 }

        /* Grid */
        .snx-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:12px; }
        .snx-item { padding:12px; transition: transform .12s ease, box-shadow .12s ease; }
        .snx-item:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,.25); }
        .snx-thumb {
          background: radial-gradient(400px 200px at 50% -20%, #18283c 0%, #0f1d2e 60%, #0b1726 100%);
          border-radius: 10px; height: 130px; margin-bottom: 10px; overflow: hidden;
          display:flex; align-items:center; justify-content:center;
        }

        /* Precio MUY visible */
        .snx-cta { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; }
        .snx-price {
          font-weight: 900;
          font-size: 16px;
          letter-spacing: .2px;
          padding: 10px 14px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ff9d4d, #ff7a1a);
          color: #fff;
          text-shadow: 0 1px 0 rgba(0,0,0,.35);
          border: 1px solid rgba(0,0,0,.25);
          box-shadow: 0 6px 18px rgba(255,122,26,.25), inset 0 1px 0 rgba(255,255,255,.35);
          min-width: 92px;
          text-align: center;
        }

        /* Modal / Avisos / Toast */
        .snx-backdrop {
          position: fixed; inset: 0; display: grid; place-items: center;
          background: color-mix(in oklab, #000 55%, transparent);
          backdrop-filter: blur(4px);
          z-index: 9999;
          animation: snxFade .18s ease-out;
        }
        @keyframes snxFade { from { opacity: .0 } to { opacity: 1 } }

        .snx-modal {
          width: min(780px, 94vw);
          border-radius: 16px;
          padding: 0;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
          box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);
        }
        .snx-head { display:flex; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.06); }
        .snx-title { font-size: 18px; font-weight: 700; margin: 0; }
        .snx-close { margin-left:auto; border:0; background:transparent; color:inherit; width:36px; height:36px; border-radius:10px; cursor:pointer; }
        .snx-close:hover { background: rgba(255,255,255,.06) }
        .snx-body { padding: 18px; display: grid; gap: 16px; grid-template-columns: 1.1fr .9fr; }
        @media (max-width: 860px) { .snx-body { grid-template-columns: 1fr } }
        .snx-card { border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:14px; background: rgba(12,18,30,.6); }
        .snx-field { display:grid; gap:6px; margin-bottom:12px }
        .snx-label { font-size: 12px; opacity:.85 }
        .snx-input, .snx-select { width:100%; height:40px; border-radius:10px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:inherit; padding:0 12px; outline:none; }
        .snx-input[readonly] { opacity:.75 }
        .snx-select { color-scheme: dark; } .snx-select option { background:#0c121e; color:#e8eef9; }
        .snx-actions { display:flex; gap:10px; padding:14px 18px; border-top:1px solid rgba(255,255,255,.06); background: linear-gradient(180deg, transparent, rgba(255,255,255,.02)); }

        .snx-notice { width:min(520px,92vw); border-radius:16px; padding:0; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.03)); box-shadow:0 22px 68px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06); }
        .snx-notice-head { display:flex; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid rgba(255,255,255,.06); }
        .snx-notice-body { padding:18px; }
        .snx-notice-actions { display:flex; justify-content:flex-end; gap:10px; padding:12px 18px; border-top:1px solid rgba(255,255,255,.06); }

        .snx-toast-wrap { position: fixed; inset: 18px 0 auto 0; display:flex; justify-content:center; z-index: 10000; pointer-events:none; }
        .snx-toast { pointer-events:auto; display:flex; align-items:flex-start; gap:12px; min-width:260px; max-width:520px; background: linear-gradient(180deg, rgba(26,40,24,.9), rgba(18,30,18,.9)); border:1px solid rgba(120,200,120,.35); box-shadow:0 18px 58px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06); color:#e8ffe8; padding:12px 14px; border-radius:12px; animation: snxSlide .22s ease-out; }
        .snx-toast-icon { width:26px; height:26px; border-radius:999px; display:grid; place-items:center; background:rgba(120,200,120,.25); border:1px solid rgba(120,200,120,.45); font-size:16px; }
        .snx-toast-title { margin:0; font-weight:700; }
        .snx-toast-msg { margin:2px 0 0; opacity:.9; }
        .snx-toast-btn { margin-left:auto; background:transparent; border:0; color:#c9ffcc; padding:6px 8px; border-radius:8px; cursor:pointer; }
        .snx-toast-btn:hover { background: rgba(255,255,255,.06); }
        @keyframes snxSlide { from { transform: translateY(-8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <section className="wc-section">
        <div className="wc-container">
          <div className="wc-section-head">
            <div className="snx-toolbar">
              <div>
                <h2 style={{ margin: 0 }}>🍿 Snacks</h2>
                <p style={{ margin: 0, opacity: .85 }}>Elige tus productos o combos y realiza tu pedido durante una función activa.</p>
              </div>
              <div className="spacer" />
              <button className="wc-btn wc-btn-primary" onClick={() => navigate('/welcome-cliente')}>
                🏠 Inicio
              </button>
              <button className="wc-btn" onClick={() => navigate('/mis-pedidos-snacks')}>
                📒 Ver estado de mis pedidos
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
            {['TODOS', 'PRODUCTOS', 'COMBOS'].map((t) => (
              <button
                key={t}
                className={`wc-btn ${tab === t ? 'wc-btn-primary' : 'wc-btn-ghost'}`}
                onClick={() => setTab(t)}
              >
                {t === 'TODOS' ? 'Todos' : t === 'PRODUCTOS' ? 'Productos' : 'Combos'}
              </button>
            ))}
          </div>

          {/* Grid + Carrito */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 16 }}>
            {/* GRID */}
            <div className="wc-card" style={{ padding: 16, minHeight: 320 }}>
              {loading ? (
                <div style={{ padding: 16 }}>Cargando…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 16, opacity: 0.8 }}>No hay elementos para mostrar.</div>
              ) : (
                <div className="snx-grid">
                  {filtered.map((it) => {
                    const candidates = getImgCandidates(it);
                    return (
                      <article key={`${it.tipo}-${it.id}`} className="wc-card snx-item">
                        <div className="snx-thumb">
                          {candidates.length > 0 ? (
                            <img
                              src={candidates[0]}
                              alt={it.nombre}
                              data-idx="0"
                              onError={(e) => {
                                const idx = Number(e.currentTarget.dataset.idx || 0);
                                const next = candidates[idx + 1];
                                if (next) {
                                  e.currentTarget.dataset.idx = String(idx + 1);
                                  e.currentTarget.src = next;
                                } else {
                                  // sin más candidatos: ocultar la imagen
                                  e.currentTarget.style.display = 'none';
                                }
                              }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ opacity: 0.6 }}>Sin imagen</span>
                          )}
                        </div>
                        <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>
                          {it.nombre}
                          <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 6 }}>
                            {it.tipo === 'COMBO' ? '(Combo)' : ''}
                          </span>
                        </h3>

                        {/* Precio destacado + CTA */}
                        <div className="snx-cta">
                          <span className="snx-price">{fmtQ(it.precio)}</span>
                          <button className="wc-btn wc-btn-primary" onClick={() => addToCart(it)}>
                            Agregar
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CARRITO */}
            <aside className="wc-card" style={{ padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>🧾 Carrito</h3>
              {cart.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Tu carrito está vacío.</div>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                    {cart.map((it) => (
                      <li
                        key={`${it.tipo}-${it.id}`}
                        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            {it.tipo === 'COMBO' ? 'Combo' : 'Producto'} · {fmtQ(it.precio)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button className="wc-btn" onClick={() => decQty(it)}>-</button>
                          <div style={{ minWidth: 24, textAlign: 'center' }}>{it.qty}</div>
                          <button className="wc-btn" onClick={() => addToCart(it)}>+</button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <hr style={{ borderColor: 'rgba(255,255,255,.08)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>Total</strong>
                    <strong>{fmtQ(total)}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="wc-btn wc-btn-ghost" onClick={clearCart}>Vaciar</button>
                    <button className="wc-btn wc-btn-primary" style={{ marginLeft: 'auto' }} onClick={openModal}>
                      Realizar pedido
                    </button>
                  </div>
                </>
              )}
            </aside>
          </div>
        </div>
      </section>

      {/* ===== MODAL ===== */}
      {show && (
        <div role="dialog" aria-modal="true" className="snx-backdrop">
          <div className="snx-modal">
            <div className="snx-head">
              <h3 className="snx-title">Confirmar pedido</h3>
              <button className="snx-close" onClick={closeModal} aria-label="Cerrar">✕</button>
            </div>

            <div className="snx-body">
              {/* Columna izquierda: Datos */}
              <div className="snx-card">
                <div className="snx-field">
                  <label className="snx-label">Selecciona tu función (activas ahora)</label>
                  <select
                    className="snx-select"
                    value={selFuncion?.id ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const f = funciones.find((x) => String(x.id) === String(val)) || null;
                      setSelFuncion(f);
                    }}
                  >
                    <option value="">— Selecciona —</option>
                    {funciones.map((f) => (
                      <option key={f.id} value={f.id}>
                        {labelFuncion(f)}
                      </option>
                    ))}
                  </select>
                  {funciones.length === 0 && (
                    <small style={{opacity:.75}}>No se detectaron funciones activas en este momento.</small>
                  )}
                </div>

                <div className="snx-field">
                  <label className="snx-label">Sala</label>
                  <input
                    className="snx-input"
                    value={selFuncion ? (selFuncion.salaNombre || selFuncion.salaId || '') : ''}
                    readOnly
                  />
                </div>

                <div className="snx-field">
                  <label className="snx-label">Ingresa tu butaca</label>
                  <input
                    className="snx-input"
                    placeholder="Ej. B12"
                    value={butaca}
                    onChange={(e) => setButaca(e.target.value)}
                  />
                </div>

                <div className="snx-field">
                  <label className="snx-label">Ingresa tu nombre</label>
                  <input
                    className="snx-input"
                    placeholder="Tu nombre"
                    value={clienteNombre}
                    onChange={(e) => setClienteNombre(e.target.value)}
                  />
                </div>
              </div>

              {/* Columna derecha: Totales */}
              <div className="snx-card">
                <div className="snx-field">
                  <label className="snx-label">Total a pagar</label>
                  <input className="snx-input" value={fmtQ(total)} readOnly />
                </div>

                <div className="snx-field">
                  <label className="snx-label">Efectivo con el que pagará</label>
                  <input
                    className="snx-input"
                    inputMode="decimal"
                    placeholder="Ej. 100.00"
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="snx-actions">
              <button className="wc-btn wc-btn-ghost" onClick={closeModal}>Cancelar</button>
              <button className="wc-btn wc-btn-primary" onClick={submitPedido} style={{ marginLeft: 'auto' }}>
                Confirmar y crear pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AVISO ELEGANTE ===== */}
      {notice && (
        <div role="dialog" aria-modal="true" className="snx-backdrop" onClick={() => setNotice(null)}>
          <div className="snx-notice" onClick={(e) => e.stopPropagation()}>
            <div className="snx-notice-head">
              <h3 className="snx-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
                🎬 {notice.title}
              </h3>
            </div>
            <div className="snx-notice-body">
              <p style={{ margin: 0 }}>{notice.msg}</p>
            </div>
            <div className="snx-notice-actions">
              <button className="wc-btn wc-btn-primary" onClick={() => setNotice(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toast && (
        <div className="snx-toast-wrap">
          <div className="snx-toast" role="status" aria-live="polite">
            <div className="snx-toast-icon">✔</div>
            <div>
              <p className="snx-toast-title">{toast.title || 'Éxito'}</p>
              {toast.msg && <p className="snx-toast-msg">{toast.msg}</p>}
            </div>
            <button className="snx-toast-btn" onClick={() => setToast(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </main>
  );
}
