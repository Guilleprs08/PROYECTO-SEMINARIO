// src/pages/VentaDeEntradas.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import '../styles/dashboard.css'; // usamos el look & feel del admin

/* ================== API BASE ================== */
const API_BASE =
  import.meta.env?.VITE_API_BASE ||
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ================== Axios helpers ================== */
const authHeaders = () => {
  const token = localStorage.getItem('mf_token');
  const h = {};
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const get = (path, cfg = {}) =>
  axios.get(`${API_BASE}${path}`, { withCredentials: false, headers: { ...authHeaders() }, ...cfg });

const post = (path, body, cfg = {}) =>
  axios.post(`${API_BASE}${path}`, body, {
    withCredentials: false,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
    ...cfg,
  });

/* ================== Utils ================== */
// antes: es-PE / PEN
const currency = (v = 0) =>
  Number(v || 0).toLocaleString('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  });


const diasAbbr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad2 = (n) => String(n).padStart(2, '0');

const parseFecha = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatFechaCorta = (v) => {
  const d = parseFecha(v);
  if (!d) return '—';
  return `${diasAbbr[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/* ================== Normalizadores ================== */
const normMovie = (m) => ({
  id: m.id,
  titulo: m.titulo,
  duracion: m.duracionMin,
  genero: m.categoriaNombre ?? null,
  idioma: m.idioma ?? null,
  clasificacion: m.clasificacion ?? null,
  poster: m.imagenUrl ?? null,
});

const normFuncion = (f) => {
  const totalSeats = Number(f.totalSeats ?? f.TOTALSEATS ?? 0);
  const vendidos   = Number(f.vendidos   ?? f.VENDIDOS   ?? 0);
  const reservados = Number(f.reservados ?? f.RESERVADOS ?? 0);
  const disponibles= Number(f.disponibles?? f.DISPONIBLES?? Math.max(0, totalSeats - vendidos - reservados));
  return {
    id: f.id,
    peliculaId: f.peliculaId,
    salaId: f.salaId,
    salaNombre: f.salaNombre ?? `Sala ${f.salaId}`,
    horaInicio: f.horaInicio,
    horaFinal: f.horaFinal,
    precio: Number(f.precio ?? 0),
    formato: f.formato || null,
    fecha: f.fecha || null,
    totalSeats, vendidos, reservados, disponibles,
    soldOut: vendidos >= totalSeats && totalSeats > 0,
  };
};

const normSeat = (s) => ({
  idFa: s.idFa,
  fila: String(s.fila),
  col: Number(s.columna),
  estado: String(s.estado || '').toUpperCase(), // DISPONIBLE | RESERVADO | VENDIDO | BLOQUEADO
  bloqueadoHasta: s.bloqueado_hasta || null,
});
const seatKey = (s) => `${s.fila}-${s.col}`;

/* ================== Componente ================== */
export default function VentaDeEntradas() {
  // catálogo
  const [peliculas, setPeliculas] = useState([]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('ALL');

  // selección
  const [peliculaSel, setPeliculaSel] = useState(null);
  const [funciones, setFunciones] = useState([]);
  const [funcionSel, setFuncionSel] = useState(null);

  // asientos
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [seats, setSeats] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);

  // venta
  const [metodoPago, setMetodoPago] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // cargar películas (vista empleado)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await get('/api/empleado/cartelera');
        setPeliculas(Array.isArray(data) ? data.map(normMovie) : []);
      } catch {
        setPeliculas([]);
      }
    })();
  }, []);

  // categorías dinámicas
  const categorias = useMemo(
    () => ['ALL', ...new Set(peliculas.map((p) => p.genero).filter(Boolean))],
    [peliculas]
  );

  // filtro por búsqueda/categoría
  const listFiltrada = useMemo(() => {
    const q = query.trim().toLowerCase();
    return peliculas.filter((p) => {
      if (cat !== 'ALL' && (p.genero ?? '') !== cat) return false;
      if (!q) return true;
      return (p.titulo ?? '').toLowerCase().includes(q);
    });
  }, [peliculas, query, cat]);

  // helpers asientos
  const ordenarYSetear = (arr) => {
    const a = [...arr];
    a.sort((x, y) => (x.fila === y.fila ? x.col - y.col : x.fila.localeCompare(y.fila)));
    setSeats(a);
  };

  const cargarAsientos = async (funcionId) => {
    setLoadingSeats(true);
    try {
      const { data } = await get(`/api/empleado/funciones/${funcionId}/asientos`);
      ordenarYSetear(Array.isArray(data) ? data.map(normSeat) : []);
    } catch {
      setSeats([]);
    } finally {
      setLoadingSeats(false);
    }
  };

  const abrirFunciones = async (pelicula) => {
    setPeliculaSel(pelicula);
    setFuncionSel(null);
    setSeats([]);
    setSeleccionados([]);
    setMetodoPago('');
    try {
      const { data } = await get(`/api/empleado/cartelera/${pelicula.id}/funciones`);
      setFunciones(Array.isArray(data) ? data.map(normFuncion) : []);
    } catch {
      setFunciones([]);
    }
  };

  const seleccionarFuncion = async (f) => {
    setFuncionSel(f);
    setSeleccionados([]);
    setMetodoPago('');
    try {
      await post(`/api/empleado/funciones/${f.id}/liberar-reservas-vencidas`, {});
    } catch {}
    await cargarAsientos(f.id);
  };

  const filas = useMemo(() => Array.from(new Set(seats.map((s) => s.fila))), [seats]);
  const maxCols = useMemo(() => {
    let m = 0;
    seats.forEach((s) => { if (s.col > m) m = s.col; });
    return m || 10;
  }, [seats]);

  // permitir seleccionar RESERVADO, prohibir VENDIDO/BLOQUEADO
  const toggleSeat = (s) => {
    const esVendido = s.estado === 'VENDIDO';
    const esBloqueadoReal = s.estado === 'BLOQUEADO';
    if (esVendido || esBloqueadoReal) return;
    const key = seatKey(s);
    setSeleccionados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const selectedSeatIds = useMemo(() => {
    const map = new Map(seats.map((s) => [seatKey(s), s.idFa]));
    return seleccionados.map((k) => map.get(k)).filter(Boolean);
  }, [seats, seleccionados]);

  const precioUnit = Number(funcionSel?.precio || 0);
  const total = precioUnit * seleccionados.length;

  const confirmarAccion = async () => {
    if (!funcionSel || selectedSeatIds.length === 0) return;
    if (!metodoPago) { alert('Selecciona un método de pago'); return; }
    setSubmitting(true);
    try {
      await post(`/api/empleado/funciones/${funcionSel.id}/vender`, {
        asientos: selectedSeatIds,
        metodoPago,
      });
      alert('¡Venta registrada! Asientos vendidos.');
      await cargarAsientos(funcionSel.id);
      setSeleccionados([]);
      setMetodoPago('');
    } catch (e) {
      console.error('Confirmar venta ->', e);
      alert('Error al confirmar la venta.');
    } finally {
      setSubmitting(false);
    }
  };

  const imgUrl = (p) => (p.poster && !p.poster.startsWith('http') ? `${API_BASE}${p.poster}` : p.poster);

  return (
    <div className="card">
      <div className="card-header">
        <span className="emoji">🎫</span>
        <h3 className="card-title m-0">Venta de Entradas</h3>
        <div className="card-subtitle">Vista para empleados</div>
      </div>

      {/* Toolbar de búsqueda */}
      <div className="toolbar" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          placeholder="Buscar película..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
          {categorias.map((c) => (
            <option key={c} value={c}>{c === 'ALL' ? 'Todas las categorías' : c}</option>
          ))}
        </select>
        <button className="btn">Buscar</button>
      </div>

      {/* Layout admin en 3 paneles */}
      <div className="admin-venta-grid">
        {/* Panel 1: Películas */}
        <section className="pane">
          <div className="pane-title">Películas ({listFiltrada.length})</div>
          <div className="movie-list">
            {listFiltrada.length === 0 && <div className="muted">No hay películas activas que coincidan.</div>}
            {listFiltrada.map((p) => (
              <div key={p.id} className={`movie-row ${peliculaSel?.id === p.id ? 'active' : ''}`}>
                <div className="movie-thumb" style={{ backgroundImage: imgUrl(p) ? `url('${imgUrl(p)}')` : 'none' }} />
                <div className="movie-meta">
                  <div className="movie-title">{p.titulo}</div>
                  <div className="movie-sub">
                    ⏱️ {p.duracion ?? '--'} min {p.genero ? `· ${p.genero}` : ''} {p.idioma ? `· ${p.idioma}` : ''}
                  </div>
                </div>
                <button className="btn-sm" onClick={() => abrirFunciones(p)}>Ver funciones</button>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 2: Funciones */}
        <section className="pane">
          <div className="pane-title">
            Funciones {peliculaSel ? `— ${peliculaSel.titulo}` : ''}
          </div>
          {peliculaSel == null && <div className="muted">Selecciona una película para listar funciones.</div>}
          {peliculaSel != null && funciones.length === 0 && <div className="muted">No hay funciones activas.</div>}
          <div className="funciones-list">
            {funciones.map((f) => {
              const disabled = !!f.soldOut;
              const active = funcionSel?.id === f.id;
              return (
                <button
                  key={f.id}
                  className={`funcion-row ${active ? 'selected' : ''}`}
                  onClick={() => !disabled && seleccionarFuncion(f)}
                  title={disabled ? 'Función agotada' : 'Seleccionar función'}
                  disabled={disabled}
                >
                  <div className="funcion-left">
                    <div className="funcion-row-1">
                      <b>{f.horaInicio}</b>
                      {f.formato && <span className="badge">{f.formato}</span>}
                      {disabled && <span className="badge danger">AGOTADA</span>}
                    </div>
                    <div className="funcion-row-2">
                      📍 {f.salaNombre} · {formatFechaCorta(f.fecha)} ·
                      &nbsp;Vendidos: {f.vendidos} · Disp: {f.disponibles}
                    </div>
                  </div>
                  <div className="funcion-price">{currency(f.precio)}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Panel 3: Asientos + Resumen */}
        <section className="pane">
          <div className="pane-title">Asientos y cobro</div>

          {!funcionSel && <div className="muted">Elige una función para gestionar asientos.</div>}

          {funcionSel && (
            <>
              {loadingSeats && <div className="muted" style={{ marginBottom: 8 }}>Cargando asientos…</div>}

              {!loadingSeats && (
                <>
                  {/* leyenda */}
                  <div className="legend">
                    <span><i className="lg lg-ok" /> Disponible</span>
                    <span><i className="lg lg-res" /> Reservado</span>
                    <span><i className="lg lg-occ" /> Ocupado</span>
                    <span><i className="lg lg-block" /> Bloqueado</span>
                    <span><i className="lg lg-sel" /> Seleccionado</span>
                  </div>

                  {/* grilla */}
                  <div
                    className="seat-grid"
                    style={{ gridTemplateColumns: `repeat(${maxCols}, 24px)` }}
                  >
                    {filas.map((fila) => {
                      const maxCol = seats.filter((x) => x.fila === fila).reduce((m, x) => Math.max(m, x.col), 0);
                      return Array.from({ length: maxCol }).map((_, i) => {
                        const col = i + 1;
                        const s = seats.find((x) => x.fila === fila && x.col === col);
                        const key = s ? `${s.fila}-${s.col}` : `${fila}-${col}`;
                        if (!s) return <div key={key} className="seat seat--empty" />;
                        const isSel = seleccionados.includes(key);
                        const esReservado = s.estado === 'RESERVADO';
                        const esVendido = s.estado === 'VENDIDO';
                        const esBloqueado = s.estado === 'BLOQUEADO';
                        const state = isSel
                          ? 'selected'
                          : esReservado
                          ? 'reserved'
                          : esVendido
                          ? 'occupied'
                          : esBloqueado
                          ? 'blocked'
                          : 'available';
                        return (
                          <div
                            key={key}
                            className={`seat ${state}`}
                            onClick={() => toggleSeat(s)}
                            title={`${s.fila}${s.col}`}
                          />
                        );
                      });
                    })}
                  </div>

                  <div className="screen">PANTALLA</div>

                  {/* Resumen */}
                  <div className="summary">
                    <div><b>Película:</b> {peliculaSel?.titulo}</div>
                    <div><b>Horario:</b> {funcionSel.horaInicio}</div>
                    <div><b>Sala:</b> {funcionSel.salaNombre}</div>
                    <div><b>Asientos:</b> {seleccionados.length > 0
                      ? seleccionados.map(k => {
                          const [ff, cc] = k.split('-');
                          return `${ff}${cc}`;
                        }).join(', ')
                      : '—'}</div>
                    <div><b>Cantidad:</b> {seleccionados.length}</div>
                    <div className="total"><b>Total:</b> {currency(total)}</div>
                  </div>

                  {/* métodos de pago */}
                  <div className="pay-methods">
                    {[
                      { key: 'TARJETA', label: 'Tarjeta' },
                      { key: 'PAYPAL', label: 'PayPal' },
                      { key: 'EFECTIVO', label: 'Efectivo' },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`btn-chip ${metodoPago === opt.key ? 'selected' : ''}`}
                        onClick={() => setMetodoPago(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {metodoPago && <div className="muted">Método seleccionado: <b>{metodoPago}</b></div>}

                  <button
                    className="btn primary"
                    style={{ marginTop: 12 }}
                    disabled={!funcionSel || seleccionados.length === 0 || submitting || !metodoPago}
                    onClick={confirmarAccion}
                  >
                    {submitting ? 'Procesando…' : 'Confirmar venta'}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* estilos mínimos para el layout admin de esta vista */}
      <style>{`
        .admin-venta-grid{
          display:grid; grid-template-columns: 1.1fr 1fr 1.2fr; gap:16px;
        }
        @media (max-width: 1100px){
          .admin-venta-grid{ grid-template-columns: 1fr; }
        }
        .pane{ background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; }
        .pane-title{ font-weight:600; margin-bottom:10px; }

        .movie-list{ display:flex; flex-direction:column; gap:10px; max-height:520px; overflow:auto; }
        .movie-row{ display:flex; align-items:center; gap:12px; border:1px solid #eee; border-radius:10px; padding:8px 10px; }
        .movie-row.active{ outline:2px solid #6366f1; }
        .movie-thumb{ width:52px; height:70px; border-radius:8px; background:#f3f4f6 center/cover no-repeat; flex:0 0 52px; }
        .movie-meta{ flex:1; min-width:0; }
        .movie-title{ font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .movie-sub{ font-size:12px; color:#6b7280; }

        .btn, .btn-sm, .btn-chip, .btn.primary{
          border:0; background:#f3f4f6; padding:8px 12px; border-radius:8px; cursor:pointer;
        }
        .btn-sm{ padding:6px 10px; font-size:12px; }
        .btn.primary{ background:#2563eb; color:#fff; }
        .btn:disabled, .btn-sm:disabled{ opacity:.6; cursor:not-allowed; }

        .funciones-list{ display:flex; flex-direction:column; gap:10px; max-height:520px; overflow:auto; }
        .funcion-row{ display:flex; justify-content:space-between; align-items:center; border:1px solid #eee; border-radius:10px; padding:10px; background:#fafafa; }
        .funcion-row.selected{ outline:2px solid #2563eb; background:#fff; }
        .funcion-left{ display:flex; flex-direction:column; gap:2px; }
        .funcion-row-1{ display:flex; align-items:center; gap:8px; }
        .funcion-row-2{ font-size:12px; color:#6b7280; }
        .funcion-price{ font-weight:600; }

        .badge{ background:#eef2ff; color:#3730a3; padding:2px 8px; border-radius:999px; font-size:12px; }
        .badge.danger{ background:#fee2e2; color:#991b1b; }

        .legend{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:8px; color:#4b5563; font-size:13px; }
        .lg{ display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:6px; vertical-align:middle; }
        .lg-ok{ background:#22c55e; }
        .lg-res{ background:#eab308; }
        .lg-occ{ background:#ef4444; }
        .lg-block{ background:#9ca3af; }
        .lg-sel{ background:#2563eb; }

        .seat-grid{ display:grid; gap:6px; margin-bottom:10px; }
        .seat{ width:24px; height:24px; border-radius:6px; border:1px solid #e5e7eb; background:#10b98122; cursor:pointer; }
        .seat.available{ background:#10b98122; }
        .seat.reserved{ background:#f59e0b22; }
        .seat.occupied{ background:#ef444422; cursor:not-allowed; }
        .seat.blocked{ background:#9ca3af22; cursor:not-allowed; }
        .seat.selected{ background:#2563eb33; border-color:#2563eb; }
        .seat--empty{ visibility:hidden; }

        .screen{ text-align:center; font-size:12px; color:#6b7280; margin:6px 0 10px; }

        .summary{ display:grid; grid-template-columns: 1fr 1fr; gap:6px 14px; margin:8px 0; font-size:14px; }
        .summary .total{ grid-column: 1 / -1; font-size:16px; }

        .pay-methods{ display:flex; gap:8px; margin-top:6px; }
        .btn-chip{ padding:6px 10px; font-size:12px; background:#f3f4f6; }
        .btn-chip.selected{ background:#2563eb; color:#fff; }

        .input, .select{
          border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; background:#fff;
        }
        .muted{ color:#6b7280; font-size:13px; }
      `}</style>
    </div>
  );
}
