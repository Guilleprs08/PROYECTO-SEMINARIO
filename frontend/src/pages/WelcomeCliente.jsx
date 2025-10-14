// src/pages/WelcomeCliente.jsx
import React, {
  useMemo,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/clientecartelera.css';

const CINE_NAME = import.meta.env?.VITE_CINE_NAME || 'MovieFlow';
const API_BASE  = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const WC_CACHE_KEY = 'wc_slides_cache';
const WC_DEBUG = (import.meta.env?.VITE_WC_DEBUG || '') === '1';

/* ================= UI helpers ================= */
function getClienteNombre() {
  try {
    const raw = localStorage.getItem('mf_user');
    if (raw) {
      const u = JSON.parse(raw);
      return u?.name || u?.nombre || u?.given_name || null;
    }
  } catch {}
  try {
    const t = localStorage.getItem('mf_token');
    if (t && t.includes('.')) {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload?.name || payload?.given_name || null;
    }
  } catch {}
  return null;
}

/* ===== Auth / session helpers (para el calendario) ===== */
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
function getClienteId() {
  try {
    const raw = localStorage.getItem('mf_user');
    if (raw) {
      const u = JSON.parse(raw);
      return u?.id || u?.clienteId || null;
    }
  } catch {}
  const v = localStorage.getItem('clienteId');
  return v ? Number(v) : null;
}

/* ================= Mapeo (carrusel) ================= */
function pickPoster(movie) {
  const API = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';
  const candidates = [
    movie?.imagenUrl, movie?.poster, movie?.poster_url, movie?.posterUrl, movie?.url_poster, movie?.poster_path,
    movie?.portada, movie?.portada_url, movie?.portada_pelicula,
    movie?.imagen, movie?.imagen_url, movie?.imagen_portada, movie?.img, movie?.foto,
    movie?.banner, movie?.banner_url, movie?.urlImagen, movie?.url_imagen, movie?.rutaImagen,
  ].filter(Boolean);

  let src = candidates[0];
  if (!src) return null;

  const isAbs = /^https?:\/\//i.test(src);
  if (isAbs) return src;

  if (!src.startsWith('/')) src = '/' + src;
  return `${API}${src}`;
}
function pickTitle(m) {
  return (
    m?.titulo ||
    m?.titulo_pelicula ||
    m?.tituloPelicula ||
    m?.title ||
    m?.name ||
    m?.nombre ||
    'Película'
  );
}
function pickGenre(m) {
  return (
    m?.genero ||
    m?.genre ||
    m?.categoria ||
    m?.categoria_nombre ||
    m?.categoriaNombre ||
    m?.category ||
    m?.categoryName ||
    ''
  );
}
function pickClasificacion(m) {
  return (
    m?.clasificacion ||
    m?.clasificacionNombre ||
    m?.classification ||
    m?.rating ||
    m?.rated ||
    ''
  );
}
function toSlide(movie) {
  const src = pickPoster(movie);
  if (!src) return null;
  const titulo = pickTitle(movie);
  const genero = pickGenre(movie);
  const clasif = pickClasificacion(movie);
  const desc = [genero, clasif].filter(Boolean).join(' · ');
  return { src, titulo, desc };
}
function uniqByTitle(items) {
  const seen = new Set();
  return items.filter((s) => {
    const key = (s.titulo || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function readLocalPeliculas() {
  const keys = ['mf_peliculas', 'mf_cartelera', 'peliculas', 'cartelera', 'pelis', 'movies'];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch {}
  }
  return null;
}

/* ================= Banner Evento Privado (glass) ================= */
function EventoPrivadoBanner() {
  const navigate = useNavigate();
  return (
    <section className="wv-evento-banner" aria-labelledby="eventoPrivadoTitle">
      <div className="wv-evento-glass">
        <div className="wv-evento-badges">
          <span className="wv-badge wv-float-1">🎉</span>
          <span className="wv-badge wv-float-2">🎬</span>
          <span className="wv-badge wv-float-3">🎧</span>
        </div>

        <header className="wv-evento-head">
          <h2 id="eventoPrivadoTitle">¿Quieres una función privada o reservar un evento importante?</h2>
          <p className="wv-evento-sub">
            Celebra cumpleaños, eventos corporativos o una noche épica con tu grupo.
          </p>
        </header>

        <ul className="wv-evento-features" aria-label="Beneficios">
          <li>Butacas premium y sala climatizada</li>
          <li>Audio envolvente y pantalla gigante</li>
          <li>Snacks y combos personalizados</li>
          <li>Asistencia del staff durante tu evento</li>
        </ul>

        <div className="wv-evento-cta">
          <button className="wv-btn-gradient" onClick={() => navigate('/reservar-evento')}>
            Reservar evento
          </button>
          <button className="wv-btn-ghost" onClick={() => navigate('/mis-reservas')}>
            Ver mis reservas
          </button>
        </div>
      </div>
    </section>
  );
}

/* ================= MiniCalendario (sin cambios funcionales) ================= */
function MiniCalendario() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [softMsg, setSoftMsg] = useState("");

  const today = new Date();
  const [visible, setVisible] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hm  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const getClienteId = () => {
    try { const u = JSON.parse(localStorage.getItem("mf_user")||"{}"); return u?.id || u?.clienteId || null; } catch {}
    const v = localStorage.getItem("clienteId"); return v ? Number(v) : null;
  };
  const getClienteEmail = () => {
    try { const u = JSON.parse(localStorage.getItem("mf_user")||"{}"); if (u?.email || u?.correo) return u.email||u.correo; } catch {}
    try {
      const t = localStorage.getItem("mf_token");
      if (t && t.includes(".")) { const p = JSON.parse(atob(t.split(".")[1])); return p?.email || p?.correo || null; }
    } catch {}
    return null;
  };

  const headersAuth = () => {
    const t = localStorage.getItem("mf_token");
    return t ? { "Authorization": `Bearer ${t}` } : {};
  };

  async function safeJson(res) {
    if (!res) return null;
    try {
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) return await res.json();
      const txt = await res.text();
      const t = txt.trim();
      if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
      return null;
    } catch { return null; }
  }
  const hasData = (d) => Array.isArray(d) ? d.length > 0 : (d && Array.isArray(d.rows) && d.rows.length > 0);

  function parseTS(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") {
      const s = v.trim();
      const t = Date.parse(s); if (!Number.isNaN(t)) return new Date(t);
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
      m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (m) return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +(m[6]||0));
    }
    return null;
  }

  function getSalaLabel(row) {
    const cand =
      row.SALA_NOMBRE ?? row.sala_nombre ??
      row.NOMBRE_SALA ?? row.nombre_sala ??
      row.SALA ?? row.sala ??
      row.SALA_ID ?? row.sala_id ?? "";

    const txt = String(cand).trim();
    if (!txt) return "Sala —";
    if (/^sala\b/i.test(txt)) return txt;
    if (/^[A-Za-z]$/.test(txt)) return `Sala ${txt.toUpperCase()}`;
    return `Sala ${txt}`;
  }

  const CalStyles = () => (
    <style>{`
      .wk-cal-wrap{margin-top:6px}
      .wk-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .wk-cal-legend{font-size:13px;opacity:.85;display:flex;align-items:center;gap:8px}
      .wk-legend-pill{width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.18);display:inline-block}
      .wk-cal-header{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-bottom:6px;color:#cbd5e1;text-align:center;font-size:13px;opacity:.85}
      .wk-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
      .wk-cal-cell{background:rgba(255,255,255,.06);border-radius:12px;padding:8px;min-height:110px}
      .wk-cal-cell.dim{opacity:.45}
      .wk-cal-cell.today{outline:1px solid rgba(255,255,255,.4)}
      .wk-cal-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
      .wk-cal-top .day{font-size:12px;opacity:.75}
      .wk-cal-bad{font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(255,255,255,.1)}
      .wk-cal-item{font-size:11px;line-height:1.25;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.12)}
      .wk-cal-item.off{opacity:.55;background:rgba(255,255,255,.06)}
      .wk-cal-empty{font-size:11px;opacity:.35}
      .wk-softmsg{margin:6px 0 10px; opacity:.75; font-size:13px;}
      .wk-cal-actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
      @media (max-width: 720px){
        .wk-cal-cell{min-height:88px;padding:6px}
        .wk-cal-item{font-size:10px;padding:4px 6px}
        .wk-cal-header{gap:6px}
        .wk-cal-grid{gap:6px}
      }
    `}</style>
  );

  const buildMonthGrid = (y,m) => {
    const first = new Date(y,m,1);
    const start = new Date(first); start.setDate(first.getDate()-first.getDay());
    return Array.from({length:42},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  };
  const monthDays = useMemo(()=>buildMonthGrid(visible.y, visible.m),[visible]);
  const monthLabel = useMemo(()=>new Date(visible.y, visible.m, 1).toLocaleString("es-ES",{month:"long",year:"numeric"}),[visible]);

  const eventsByDate = useMemo(()=>{
    const map={};
    for(const row of items){
      const sd = parseTS(row.START_TS || row.start_ts || row.START || row.start);
      if(!sd) continue;
      const key = ymd(sd);
      (map[key] ||= []).push(row);
    }
    return map;
  },[items]);

  useEffect(()=>{
    const cid = getClienteId();
    const email = getClienteEmail();

    (async ()=>{
      setLoading(true); setSoftMsg("");

      let data = null;

      try {
        const r = await fetch(`${API_BASE}/api/eventos-reservados/mis`, { headers: headersAuth(), credentials:'include' });
        const j = await safeJson(r); if (j) data = j;
      } catch {}

      if ((!data || !Array.isArray(data) || !data.length) && cid) {
        try {
          const r = await fetch(`${API_BASE}/api/eventos-reservados?clienteId=${cid}`, { headers: headersAuth(), credentials:'include' });
          const j = await safeJson(r); if (j) data = j;
        } catch {}
      }

      if ((!data || !Array.isArray(data) || !data.length) && email) {
        const q = encodeURIComponent(email);
        try {
          const r1 = await fetch(`${API_BASE}/api/eventos-reservados?uemail=${q}`, { headers: headersAuth(), credentials:'include' });
          const j1 = await safeJson(r1); if (j1) data = j1;
        } catch {}
        if ((!data || !Array.isArray(data) || !data.length)) {
          try {
            const r2 = await fetch(`${API_BASE}/api/eventos-reservados?email=${q}`, { headers: headersAuth(), credentials:'include' });
            const j2 = await safeJson(r2); if (j2) data = j2;
          } catch {}
        }
      }

      if (!data || !Array.isArray(data) || !data.length) {
        try {
          const r = await fetch(`${API_BASE}/api/eventos-reservados?all=1&_=${Date.now()}`, { credentials:'omit' });
          const j = await safeJson(r); if (j) data = j;
        } catch {}
      }
      if (!data || !Array.isArray(data) || !data.length) {
        try {
          const r = await fetch(`${API_BASE}/api/eventos-reservados?_=${Date.now()}`, { credentials:'omit' });
          const j = await safeJson(r); if (j) data = j;
        } catch {}
      }
      if (!data || !Array.isArray(data) || !data.length) {
        try {
          const r = await fetch(`${API_BASE}/api/eventos-especiales?_=${Date.now()}`, { credentials:'omit' });
          const j = await safeJson(r); if (j) data = j;
        } catch {}
      }

      const src = Array.isArray(data) ? data : (data?.rows || []);
      const norm = src.map(row=>({
        ID_EVENTO: row.ID_EVENTO ?? row.id_evento ?? row.id ?? row.ID,
        SALA_ID: row.SALA_ID ?? row.sala_id ?? row.SALA ?? row.sala ?? row.SALA_NOMBRE ?? "—",
        SALA_NOMBRE: row.SALA_NOMBRE ?? row.sala_nombre ?? row.NOMBRE_SALA ?? row.nombre_sala ?? null,
        START_TS: row.START_TS ?? row.start_ts ?? row.START ?? row.start,
        END_TS: row.END_TS ?? row.end_ts ?? row.END ?? row.end,
        DURACION_MIN: row.DURACION_MIN ?? row.duracion_min ?? row.duracion ?? null,
        PERSONAS: row.PERSONAS ?? row.personas ?? null,
        NOTAS: row.NOTAS ?? row.notas ?? "",
        ESTADO: row.ESTADO ?? row.estado ?? "",
      }));

      setItems(norm);
      if (!norm.length) setSoftMsg("No encontramos eventos para mostrar.");
      setLoading(false);
    })();
  },[]);

  const goPrev = () => setVisible(v => (v.m===0?{y:v.y-1,m:11}:{y:v.y,m:v.m-1}));
  const goNext = () => setVisible(v => (v.m===11?{y:v.y+1,m:0}:{y:v.y,m:v.m+1}));

  const weekNames = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const isToday = (d) => { const n=new Date(); return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate(); };

  return (
    <section className="wc-section">
      <CalStyles />
      <div className="wc-container">
        <div className="wc-section-head">
          <h2>🗓️ Calendario de mis eventos</h2>
          <p>Vista compacta por mes</p>
        </div>

        <div className="wc-card p-4 wk-cal-wrap">
          <div className="wk-cal-head">
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="wc-btn" onClick={goPrev}>◀</button>
              <div className="px-3 py-2" style={{borderRadius:10,background:'rgba(0,0,0,.2)'}}>
                <strong style={{textTransform:'capitalize'}}>{monthLabel}</strong>
              </div>
              <button className="wc-btn" onClick={goNext}>▶</button>
            </div>
            <div className="wk-cal-legend">
              <span className="wk-legend-pill"></span>
              <span><b>RESERVADO/CONFIRMADO</b> resaltado; <b>CANCELADO/FINALIZADO</b> atenuado.</span>
            </div>
          </div>

          {loading ? (
            <div className="p-4">Cargando…</div>
          ) : (
            <>
              {softMsg && <div className="wk-softmsg">{softMsg}</div>}

              <div className="wk-cal-header">{weekNames.map(d => <div key={d}>{d}</div>)}</div>

              <div className="wk-cal-grid">
                {monthDays.map((d,i)=>{
                  const inMonth = d.getMonth()===visible.m;
                  const key = ymd(d);
                  const evs = (eventsByDate[key] || []);
                  return (
                    <div key={i} className={`wk-cal-cell ${inMonth?'':'dim'} ${isToday(d)?'today':''}`} title={key}>
                      <div className="wk-cal-top">
                        <span className="day">{d.getDate()}</span>
                        {isToday(d) && <span className="wk-cal-bad">Hoy</span>}
                      </div>
                      {evs.length===0 ? (
                        <div className="wk-cal-empty">—</div>
                      ) : (
                        <>
                          {evs.slice(0,3).map((e,ix)=>{
                            const st = parseTS(e.START_TS ?? e.start_ts ?? e.START ?? e.start);
                            const en = parseTS(e.END_TS ?? e.end_ts ?? e.END ?? e.end);
                            const off = (e.ESTADO ?? e.estado ?? "").toString().toUpperCase().includes("CANCEL")
                                     || (e.ESTADO ?? e.estado ?? "").toString().toUpperCase().includes("FINAL");
                            const text = `${hm(st)}${en?`–${hm(en)}`:''} · ${getSalaLabel(e)}`;
                            return (
                              <div key={(e.ID_EVENTO ?? e.id ?? `${key}-${ix}`)} className={`wk-cal-item ${off?'off':''}`}>
                                {text}
                              </div>
                            );
                          })}
                          {evs.length>3 && (
                            <button className="wc-link" style={{fontSize:11,marginTop:4}} onClick={()=>navigate('/mis-reservas')}>
                              Ver {evs.length-3} más…
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="wk-cal-actions">
                <button className="wc-btn" onClick={()=>navigate('/reservar-evento')}>Reservar evento</button>
                <button className="wc-btn" onClick={()=>navigate('/mis-reservas')}>Ver lista completa</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function WelcomeCliente() {
  const navigate = useNavigate();
  const nombre = useMemo(() => getClienteNombre(), []);
  const { logout } = useContext(AuthContext) || {};

  /* ====== Fix scroll ====== */
  const GlobalFix = () => (
    <style>{`
      html, body, #root { height:auto!important; min-height:100%!important; overflow-y:auto!important; overflow-x:hidden!important; }
      .wc-page { position:relative; display:block; min-height:100%!important; height:auto!important; overflow:visible!important; }
      .wc-bg-fixed { pointer-events:none; }
      .wc-carousel { overflow:hidden!important; }
      :focus { scroll-margin-top:0!important; }
      body { margin-top:0!important; padding-top:0!important; }
    `}</style>
  );

  /* ====== Estilos del carrusel: fondo blur + poster 2:3 ====== */
  const HeroStyles = () => (
    <style>{`
      .wc-carousel { position: relative; border-radius: 18px; background:#071520; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
      .wc-hero-box { position: relative; width:100%; padding-top:42%; } /* ~21:9 */
      .wc-hero-abs { position:absolute; inset:0; overflow:hidden; border-radius:18px; }
      .wc-bg-img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; filter: blur(16px) saturate(115%) brightness(.85); transform: scale(1.08); }
      .wc-hero-grad { position:absolute; inset:0; background: linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(5,11,15,.55) 55%, rgba(5,11,15,.92) 100%); }
      .wc-slide { position:absolute; inset:0; opacity:0; transition: opacity .45s ease; }
      .wc-slide.is-active { opacity:1; }

      /* Poster card */
      .wc-poster-wrap { position:absolute; inset:0; display:grid; place-items:center; padding:24px; }
      .wc-poster { width: clamp(180px, 22vw, 320px); aspect-ratio: 2 / 3; border-radius: 14px; overflow:hidden;
                   box-shadow: 0 20px 40px rgba(0,0,0,.45), 0 4px 10px rgba(0,0,0,.35); }
      .wc-poster img { width:100%; height:100%; object-fit:cover; object-position:center; display:block; }

      /* Texto/CTA: subimos el botón y colocamos los dots debajo */
      .wc-slide-overlay { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column;
                          align-items:center; text-align:center; color:#fff; padding:14px 16px 54px; gap:10px; }
      .wc-slide-overlay h3 { font-size: clamp(18px, 2.6vw, 36px); font-weight:800; margin:0; text-shadow: 0 2px 16px rgba(0,0,0,.4); }
      .wc-slide-overlay p { margin:0; opacity:.95; font-size: clamp(12px, 1.4vw, 16px); }
      .wc-slide-overlay .wc-btn { margin-top:10px; }

      /* Controles */
      .wc-nav { position:absolute; top:50%; transform:translateY(-50%); width:42px; height:42px; border-radius:999px; border:0;
                background: rgba(255,255,255,.25); color:#fff; display:grid; place-items:center; cursor:pointer; backdrop-filter: blur(6px); }
      .wc-nav:hover { background: rgba(255,255,255,.35); }
      .wc-prev { left:14px; } .wc-next { right:14px; }

      /* Dots: ahora en línea, debajo del botón */
      .wc-dots { display:flex; gap:8px; justify-content:center; margin-top:10px; }
      .wc-dot { width:8px; height:8px; border-radius:999px; border:0; background: rgba(255,255,255,.45); cursor:pointer; }
      .wc-dot.active { background:#fff; width:20px; }

      @media (max-width: 680px){
        .wc-hero-box { padding-top:56%; } /* un poco más alto en móvil */
      }
    `}</style>
  );

  const pageRef = useRef(null);
  const forceTop = () => {
    try { window.history.scrollRestoration = 'manual'; } catch {}
    if (document.activeElement && document.activeElement !== document.body) {
      try { document.activeElement.blur(); } catch {}
    }
    window.scrollTo(0,0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };
  useLayoutEffect(() => {
    forceTop();
    const t1 = setTimeout(forceTop, 32);
    const t2 = setTimeout(forceTop, 150);
    const t3 = setTimeout(forceTop, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const [slides, setSlides] = useState([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  /* 1) Pintar algo al instante desde cache propia o del dashboard */
  useEffect(() => {
    let seeded = false;

    try {
      const raw = localStorage.getItem(WC_CACHE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) {
          setSlides(arr);
          seeded = true;
          if (WC_DEBUG) console.log('[WC] usando wc_slides_cache');
        }
      }
    } catch {}

    if (!seeded) {
      const local = readLocalPeliculas();
      if (local?.length) {
        const mapped = uniqByTitle(local.map(toSlide).filter(Boolean)).slice(0, 8);
        if (mapped.length) {
          setSlides(mapped);
          try { localStorage.setItem(WC_CACHE_KEY, JSON.stringify(mapped)); } catch {}
          seeded = true;
          if (WC_DEBUG) console.log('[WC] usando mf_peliculas/cartelera');
        }
      }
    }

    if (!seeded) setSlides([]);
    setLoading(false);
  }, []);

  /* 2) Intento de red: si llega, refresca y guarda */
  useEffect(() => {
    let stop = false;
    (async () => {
      const token = localStorage.getItem('mf_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const routes = [
        `${API_BASE}/api/cliente/cartelera`,
        `${API_BASE}/peliculas`,
        `${API_BASE}/api/peliculas`,
        `${API_BASE}/cartelera`,
        `${API_BASE}/api/cartelera`,
        `${API_BASE}/peliculas/activas`,
        `${API_BASE}/api/peliculas/activas`,
      ];

      for (const url of routes) {
        try {
          const r = await fetch(url, { headers, credentials: 'include' });
          if (!r.ok) continue;
          const data = await r.json();
          if (!Array.isArray(data) || !data.length) continue;

          const mapped = uniqByTitle(data.map(toSlide).filter(Boolean)).slice(0, 8);
          if (!stop && mapped.length) {
            setSlides(mapped);
            setIdx(0);
            try { localStorage.setItem(WC_CACHE_KEY, JSON.stringify(mapped)); } catch {}
            if (WC_DEBUG) console.log('[WC] datos desde red:', url);
            return;
          }
        } catch (e) {
          if (WC_DEBUG) console.log('[WC] fallo fetch', e);
        }
      }
    })();
    return () => { stop = true; };
  }, []);

  /* auto avance */
  useEffect(() => {
    if (!slides.length) return;
    const id = setInterval(() => setIdx(i => (i + 1) % slides.length), 4500);
    return () => clearInterval(id);
  }, [slides]);

  const go = (dir) => {
    if (!slides.length) return;
    setIdx(i => (dir === 'prev' ? (i - 1 + slides.length) % slides.length : (i + 1) % slides.length));
  };

  const handleLogout = () => {
    try { typeof logout === 'function' && logout(); } catch {}
    try {
      localStorage.removeItem('userData'); sessionStorage.removeItem('userData');
      localStorage.removeItem('mf_user');  localStorage.removeItem('mf_cliente'); localStorage.removeItem('mf_token');
      localStorage.removeItem('usuario_id'); localStorage.removeItem('rol_id'); localStorage.removeItem('adminId');
    } catch {}
    navigate('/login', { replace: true });
  };

  return (
    <>
      <GlobalFix />
      <HeroStyles />
      <div className="wc-bg-fixed" aria-hidden="true" />

      <main className="wc-page" role="main" ref={pageRef}>
        {/* ===== HERO ===== */}
        <section className="wc-section">
          <div className="wc-hero wc-container">
            <div className="wc-hero-inner">
              <div className="wc-badge"><i className="fas fa-clapperboard" /> {CINE_NAME}</div>
              <h1>{nombre ? `¡Bienvenido, ${nombre}!` : `¡Bienvenido a ${CINE_NAME}!`}</h1>
              <p className="wc-sub">
                Vive el mejor cine con butacas premium, sonido inmersivo y tu snack favorito.
                Compra tus boletos, gestiona tus reservas y prepárate para una función inolvidable.
              </p>
              <div className="wc-actions">
                <button className="wc-btn wc-btn-primary" onClick={() => navigate('/dashboard-cliente')}>
                  🎟️ Ver cartelera
                </button>
                <button className="wc-btn wc-btn-ghost" onClick={() => navigate('/snacks')}>
                  🍿 Pedir snacks
                </button>
                <button className="wc-btn wc-btn-ghost" onClick={() => navigate('/mis-reservas')}>
                  📒 Mis reservas
                </button>
                <button className="wc-btn wc-btn-danger" onClick={handleLogout}>
                  🚪 Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CARRUSEL: fondo blur + poster 2:3 ===== */}
        <section className="wc-section">
          <div className="wc-container">
            <div className="wc-section-head">
              <h2>🎥 Estrenos y en cartelera</h2>
              <p>Descubre lo que se está proyectando esta semana</p>
            </div>

            {slides.length > 0 ? (
              <div className="wc-carousel">
                <div className="wc-hero-box">
                  {slides.map((s, i) => (
                    <div key={`${s.titulo}-${i}`} className={`wc-slide ${i === idx ? 'is-active' : ''}`} aria-hidden={i !== idx}>
                      {/* Fondo desenfocado */}
                      <div className="wc-hero-abs">
                        <img src={s.src} alt="" className="wc-bg-img" loading="eager" decoding="async" />
                        <div className="wc-hero-grad" />
                      </div>

                      {/* Poster encima */}
                      <div className="wc-poster-wrap">
                        <div className="wc-poster">
                          <img src={s.src} alt={s.titulo} loading="lazy" decoding="async" />
                        </div>
                      </div>

                      {/* Texto, botón (más arriba) y dots debajo */}
                      <div className="wc-slide-overlay">
                        <h3>{s.titulo}</h3>
                        <p>{s.desc}</p>
                        <button className="wc-btn wc-btn-primary" onClick={() => navigate('/dashboard-cliente')}>
                          Ver funciones
                        </button>
                        <div className="wc-dots">
                          {slides.map((_, di) => (
                            <button
                              key={di}
                              className={`wc-dot ${di === idx ? 'active' : ''}`}
                              onClick={() => setIdx(di)}
                              aria-label={`Ir al slide ${di + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button className="wc-nav wc-prev" onClick={() => go('prev')} aria-label="Anterior">
                  <i className="fas fa-chevron-left" />
                </button>
                <button className="wc-nav wc-next" onClick={() => go('next')} aria-label="Siguiente">
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
            ) : (
              <div className="wc-carousel" style={{
                background: 'radial-gradient(600px 300px at 50% -10%, #152235 0%, #0d1b2a 45%, #0b1726 100%)',
                display:'grid', placeItems:'center'
              }}>
                <div style={{textAlign:'center', color:'#e2e8f0', padding:'20px'}}>
                  <h3 style={{margin:'0 0 6px'}}>Aún no hay pósters para mostrar</h3>
                  <p style={{margin:'0 0 10px', opacity:.9}}>
                    Abre la cartelera para actualizar la información (se guardará en caché).
                  </p>
                  <button className="wc-btn wc-btn-primary" onClick={() => navigate('/dashboard-cliente')}>
                    Ir a cartelera
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== BANNER: FUNCIÓN PRIVADA ===== */}
        <EventoPrivadoBanner />

        {/* ===== MINI CALENDARIO ===== */}
        <MiniCalendario />

        {/* ===== SERVICIOS ===== */}
        <section className="wc-section">
          <div className="wc-container">
            <div className="wc-section-head">
              <h2>🍿 Servicios que elevan tu experiencia</h2>
              <p>Confort, sabor y momentos memorables en cada visita</p>
            </div>

            <div className="wc-services-grid">
              <article className="wc-service">
                <div className="wc-icon"><i className="fas fa-couch" /></div>
                <h3>Comodidad Premium</h3>
                <p>Butacas espaciosas, reclinables y salas climatizadas con la mejor visibilidad.</p>
              </article>
              <article className="wc-service">
                <div className="wc-icon"><i className="fas fa-popcorn" /></div>
                <h3>Snacks Deliciosos</h3>
                <p>Palomitas, nachos, hot dogs y bebidas frías. ¡Arma tu combo ideal!</p>
                <button className="wc-link" onClick={() => navigate('/snacks')}>Ver menú</button>
              </article>
              <article className="wc-service">
                <div className="wc-icon"><i className="fas fa-masks-theater" /></div>
                <h3>Función Privada</h3>
                <p>Celebraciones, eventos corporativos o proyecciones exclusivas con tu grupo.</p>
                <button className="wc-link" onClick={() => navigate('/reservar-evento')}>Reservar evento</button>
              </article>
            </div>
          </div>
        </section>

        {/* ===== CONTACTO ===== */}
        <footer className="wc-section wc-contact">
          <div className="wc-container">
            <h2>📍 Información de contacto</h2>
            <ul>
              <li><strong>Ubicación:</strong> Plaza Israel, Morales, Izabal, Guatemala</li>
              <li><strong>Celular:</strong> 3006-1980</li>
              <li><strong>Horarios:</strong> Lun - Dom · 10:00 AM – 10:00 PM</li>
            </ul>
          </div>
        </footer>
      </main>
    </>
  );
}
