// DashboardCliente.jsx
// Mantiene la lógica original. Se refactoriza el layout para un diseño más profesional
// y consistente con la vista WelcomeCliente (azules, tarjetas suaves, sombra ligera).

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/clientecartelera.css';

/* ================== Config & helpers ================== */
const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';
const get = (path, cfg = {}) =>
  axios.get(`${API_BASE}${path}`, { withCredentials: false, ...cfg });

// Headers con token de cliente (Google) — SIN 'X-Access-Token'
const authHeaders = () => {
  const token = localStorage.getItem('mf_token');
  const h = {};
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
};

const post = (path, body, cfg = {}) =>
  axios.post(`${API_BASE}${path}`, body, {
    withCredentials: false,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
    ...cfg,
  });

const currency = (v = 0) =>
  v.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 });

/* Fecha corta "Lun 24/09/2025" */
const diasAbbr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad2 = (n) => String(n).padStart(2, '0');

const parseFecha = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, +s);
    }
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatFechaCorta = (v) => {
  const d = parseFecha(v);
  if (!d) return '—';
  return `${diasAbbr[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/* Idem key para evitar duplicados si el usuario hace doble click */
const makeIdemKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;

/* ================== Normalizadores ================== */
const normMovie = (m) => ({
  id: m.id,
  titulo: m.titulo,
  duracion: m.duracionMin,
  genero: m.categoriaNombre ?? null,
  idioma: m.idioma ?? null,
  clasificacion: m.clasificacion ?? null,
  poster: m.imagenUrl ?? null,
  // Sinopsis para overlay (con fallbacks)
  sinopsis: m.sinopsis ?? m.descripcion ?? m.resumen ?? null,
});

const normFuncion = (f) => {
  const totalSeats = Number(f.totalSeats ?? f.TOTALSEATS ?? 0);
  const vendidos   = Number(f.vendidos   ?? f.VENDIDOS   ?? 0);
  const reservados = Number(f.reservados ?? f.RESERVADOS ?? 0);
  const disponibles= Number(f.disponibles?? f.DISPONIBLES?? 0);
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
    soldOut: disponibles <= 0, // agotada si no hay asientos
  };
};

const normSeat = (s) => ({
  idFa: s.idFa,
  fila: String(s.fila),
  col: Number(s.columna),
  estado: String(s.estado || '').toUpperCase(),
  bloqueadoHasta: s.bloqueado_hasta || null,
});

const seatKey = (s) => `${s.fila}-${s.col}`;

/* ================== Componente ================== */
export default function DashboardCliente() {
  const navigate = useNavigate();

  const [peliculas, setPeliculas] = useState([]);
  const [cargandoPeliculas, setCargandoPeliculas] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [peliculaSel, setPeliculaSel] = useState(null);

  const [funciones, setFunciones] = useState([]);
  const [funcionSel, setFuncionSel] = useState(null);

  const [loadingSeats, setLoadingSeats] = useState(false);
  const [seats, setSeats] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [metodoPago, setMetodoPago] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  /* Cargar cartelera */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await get('/api/cliente/cartelera');
        setPeliculas(Array.isArray(data) ? data.map(normMovie) : []);
        // cache local para que Welcome use mismas películas
        try {
          const arr = Array.isArray(data) ? data : [];
          localStorage.setItem('mf_peliculas', JSON.stringify(arr));
          localStorage.setItem('mf_cartelera', JSON.stringify(arr));
        } catch {}
      } catch {
        setPeliculas([]);
      } finally {
        setCargandoPeliculas(false);
      }
    })();
  }, []);

  const categorias = useMemo(
    () => ['ALL', ...new Set(peliculas.map((p) => p.genero).filter(Boolean))],
    [peliculas]
  );

  const listFiltrada = useMemo(() => {
    const q = query.trim().toLowerCase();
    return peliculas.filter((p) => {
      if (cat !== 'ALL' && (p.genero ?? '') !== cat) return false;
      if (!q) return true;
      return (p.titulo ?? '').toLowerCase().includes(q);
    });
  }, [peliculas, query, cat]);

  /* Helpers asientos */
  const ordenarYSetear = (arr) => {
    const a = [...arr];
    a.sort((x, y) => (x.fila === y.fila ? x.col - y.col : x.fila.localeCompare(y.fila)));
    setSeats(a);
  };

  const cargarAsientos = async (funcionId) => {
    setLoadingSeats(true);
    try {
      const { data } = await get(`/api/cliente/funciones/${funcionId}/asientos`);
      ordenarYSetear(Array.isArray(data) ? data.map(normSeat) : []);
    } catch {
      setSeats([]);
    } finally {
      setLoadingSeats(false);
    }
  };

  /* Abrir modal -> funciones */
  const abrirModal = async (pelicula) => {
    setPeliculaSel(pelicula);
    setModalOpen(true);
    setSeleccionados([]);
    setMetodoPago(null);
    setFuncionSel(null);
    setSeats([]);
    try {
      const { data } = await get(`/api/cliente/cartelera/${pelicula.id}/funciones`);
      setFunciones(Array.isArray(data) ? data.map(normFuncion) : []);
    } catch {
      setFunciones([]);
    }
  };

  const cerrarModal = () => setModalOpen(false);

  /* Elegir función -> asientos */
  const seleccionarFuncion = async (f) => {
    setFuncionSel(f);
    setSeleccionados([]);
    setMetodoPago(null);
    await cargarAsientos(f.id);
  };

  /* Mapa */
  const filas = useMemo(() => Array.from(new Set(seats.map((s) => s.fila))), [seats]);
  const maxCols = useMemo(() => {
    let m = 0;
    seats.forEach((s) => {
      if (s.col > m) m = s.col;
    });
    return m || 10;
  }, [seats]);

  const toggleSeat = (s) => {
    const ocupado = s.estado === 'RESERVADO' || s.estado === 'VENDIDO';
    const bloqueado = s.estado === 'BLOQUEADO' || !!s.bloqueadoHasta;
    if (ocupado || bloqueado) return;
    const key = seatKey(s);
    setSeleccionados((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  /* Totales (sin impuestos) */
  const precioUnit = Number(funcionSel?.precio || 0);
  const subtotal = precioUnit * seleccionados.length;
  const total = subtotal;

  /* IDs de los asientos seleccionados (ID_FA) */
  const selectedSeatIds = useMemo(() => {
    const map = new Map(seats.map((s) => [seatKey(s), s.idFa]));
    return seleccionados.map((k) => map.get(k)).filter(Boolean);
  }, [seats, seleccionados]);

  const mostrarError = (err) => {
    let msg = 'Ocurrió un error. Intenta nuevamente.';
    if (err?.response) {
      const { status, data } = err.response;
      const serverMsg = data?.message || data?.msg || data?.error || JSON.stringify(data);
      msg = `(${status}) ${serverMsg}`;
    } else if (err?.message) {
      msg = err.message;
    }
    alert(msg);
  };

  const confirmarAccion = async () => {
    if (!funcionSel || selectedSeatIds.length === 0 || !metodoPago) return;
    setSubmitting(true);
    try {
      const idemKey = makeIdemKey();
      if (metodoPago === 'efectivo') {
        await post(`/api/cliente/funciones/${funcionSel.id}/reservar`, {
          asientos: selectedSeatIds,
          idemKey,
        });
        alert('¡Reserva realizada! Recuerda pagar en taquilla antes de la función.');
      } else {
        await post(`/api/cliente/funciones/${funcionSel.id}/pagar`, {
          asientos: selectedSeatIds,
          metodo: metodoPago.toUpperCase(), // 'TARJETA' | 'PAYPAL'
          idemKey,
        });
        alert('¡Pago confirmado! Asientos vendidos.');
      }
      await cargarAsientos(funcionSel.id);
      setSeleccionados([]);
      setMetodoPago(null);
    } catch (e) {
      console.error('Confirmar acción ->', e);
      mostrarError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const imgUrl = (p) =>
    p.poster && !p.poster.startsWith('http') ? `${API_BASE}${p.poster}` : p.poster;

  /* =============== RENDER =============== */
  return (
    <div className="cf-bg">
      {/* Topbar / Branding */}
      <div className="cf-topbar">
        <div className="cf-topbar-inner">
          <div className="cf-brand" onClick={() => navigate('/bienvenida-cliente')} role="button" tabIndex={0}>
            <span className="cf-brand-icon">🎬</span>
            <span className="cf-brand-title">MovieFlow</span>
          </div>
          <nav className="cf-actions">
            <button className="cf-action" onClick={() => navigate('/bienvenida-cliente')} title="Inicio">
              Inicio
            </button>
            <button className="cf-action" onClick={() => navigate('/mis-reservas')} title="Mis reservas">
              Mis reservas
            </button>
            <button className="cf-action" onClick={() => navigate('/reservar-evento')} title="Reservar evento privado">
              Eventos
            </button>
          </nav>
        </div>
      </div>

      <div className="cf-container">
        {/* Hero / Encabezado */}
        <header className="cf-header cf-header--tight">
          <h1 className="cf-h1">CARTELERA</h1>
          <p className="cf-subtitle">
            Elige tu película favorita y reserva tus asientos en segundos.
          </p>
        </header>

        {/* Buscador */}
        <section className="cf-search-section cf-stick">
          <div className="cf-search-bar">
            <input
              type="text"
              className="cf-input"
              placeholder="Buscar película..."
              aria-label="Buscar película"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="cf-select"
              aria-label="Filtrar por categoría"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'Todas las categorías' : c}
                </option>
              ))}
            </select>
            <button
              className="cf-btn"
              onClick={() => {/* El filtrado es reactivo; botón es visual */}}
              aria-label="Buscar"
            >
              Buscar
            </button>
          </div>
        </section>

        {/* Grid de películas */}
        <section className="cf-grid">
          {cargandoPeliculas &&
            Array.from({ length: 5 }).map((_, i) => (
              <article key={`sk-${i}`} className="cf-card cf-skeleton">
                <div className="cf-poster cf-poster--skeleton" />
                <div className="cf-info">
                  <div className="cf-title cf-skel-line" />
                  <div className="cf-details cf-skel-line" />
                </div>
              </article>
            ))}

          {!cargandoPeliculas && listFiltrada.map((p) => (
            <article key={p.id} className="cf-card" onClick={() => abrirModal(p)}>
              <div
                className="cf-poster"
                style={{
                  backgroundImage: imgUrl(p)
                    ? `linear-gradient(180deg, rgba(0,0,0,.0) 0%, rgba(0,0,0,.25) 35%, rgba(0,0,0,.6) 100%), url('${imgUrl(p)}')`
                    : 'linear-gradient(45deg, #5b8bd4, #2c3e94)',
                }}
              />

              {/* Overlay de sinopsis */}
              <div className="cf-overlay">
                <div className="cf-overlay-inner">
                  <div className="cf-overlay-title">{p.titulo}</div>
                  <div className="cf-overlay-text">
                    {p.sinopsis || 'Sinopsis no disponible.'}
                  </div>
                </div>
              </div>

              <div className="cf-info">
                <div className="cf-title">{p.titulo}</div>
                <div className="cf-badges">
                  <span className="cf-badge">⏱ {p.duracion ?? '--'} min</span>
                  {p.clasificacion && <span className="cf-badge">🔖 {p.clasificacion}</span>}
                  {p.genero && <span className="cf-badge">🎭 {p.genero}</span>}
                  {p.idioma && <span className="cf-badge">🗣 {p.idioma}</span>}
                </div>
              </div>
            </article>
          ))}
        </section>

        {!cargandoPeliculas && listFiltrada.length === 0 && (
          <div className="cf-empty">No hay películas activas que coincidan.</div>
        )}
      </div>

      {/* Modal de funciones / compra */}
      {modalOpen && (
        <div className="cf-modal" onClick={cerrarModal}>
          <div className="cf-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="cf-close" onClick={cerrarModal} aria-label="Cerrar">×</button>

            <div className="cf-modal-header">
              <h2 className="cf-h2">{peliculaSel?.titulo}</h2>
              <p className="cf-muted">
                {peliculaSel?.duracion ?? '--'} min {peliculaSel?.genero ? `• ${peliculaSel.genero}` : ''}
                {peliculaSel?.clasificacion ? ` • ${peliculaSel.clasificacion}` : ''}
              </p>
            </div>

            <div className="cf-modal-body">
              <div className="cf-booking">
                {/* Horarios */}
                <aside className="cf-showtimes">
                  <h3 className="cf-h3">Horarios disponibles</h3>
                  <div className="cf-slot-list">
                    {funciones.length === 0 && (
                      <div className="cf-muted">No hay funciones activas para esta película.</div>
                    )}

                    {funciones.map((f) => {
                      const active = funcionSel?.id === f.id;
                      const disabled = !!f.soldOut;
                      return (
                        <button
                          key={f.id}
                          className={`cf-slot ${active ? 'selected' : ''} ${disabled ? 'soldout' : ''}`}
                          onClick={() => !disabled && seleccionarFuncion(f)}
                          disabled={disabled}
                          title={disabled ? 'Función agotada' : 'Seleccionar función'}
                        >
                          <div className="cf-slot-left">
                            <div className="cf-slot-row">
                              <strong>🕐 {f.horaInicio}</strong>
                              {f.formato && <span className="cf-format-badge">{f.formato}</span>}
                              {disabled && <span className="cf-soldout-badge">AGOTADA</span>}
                            </div>
                            <div className="cf-slot-room">
                              📍 {f.salaNombre} · {formatFechaCorta(f.fecha)}
                            </div>
                          </div>
                          <div className="cf-slot-price">{currency(f.precio)}</div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                {/* Mapa + resumen + pago */}
                <main className="cf-seating">
                  <h3 className="cf-h3">Selecciona tus asientos</h3>

                  {/* Leyenda */}
                  <div className="cf-legend">
                    <div className="cf-legend-item"><span className="cf-legend-color cf-ok" /> Disponible</div>
                    <div className="cf-legend-item"><span className="cf-legend-color cf-bad" /> Ocupado</div>
                    <div className="cf-legend-item"><span className="cf-legend-color cf-leg-selected" /> Seleccionado</div>
                    <div className="cf-legend-item"><span className="cf-legend-color cf-block" /> Bloqueado</div>
                  </div>

                  {/* Grid de asientos */}
                  {loadingSeats && <div className="cf-muted cf-py">Cargando asientos…</div>}
                  {!loadingSeats && funcionSel && (
                    <>
                      <div
                        className="cf-seats-grid"
                        style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
                      >
                        {filas.map((fila) => {
                          const maxCol = seats
                            .filter((x) => x.fila === fila)
                            .reduce((m, x) => Math.max(m, x.col), 0);
                          return Array.from({ length: maxCol }).map((_, i) => {
                            const col = i + 1;
                            const s = seats.find((x) => x.fila === fila && x.col === col);
                            const key = s ? `${s.fila}-${s.col}` : `${fila}-${col}`;
                            if (!s) return <div key={key} className="cf-seat cf-seat--empty" />;

                            const isSel = seleccionados.includes(key);
                            const occupied =
                              s.estado === 'BLOQUEADO' ||
                              !!s.bloqueadoHasta ||
                              s.estado === 'RESERVADO' ||
                              s.estado === 'VENDIDO';

                            const state = isSel ? 'selected' : occupied ? 'occupied' : 'available';

                            return (
                              <div
                                key={key}
                                className={`cf-seat ${state}`}
                                onClick={() => toggleSeat(s)}
                                title={`${s.fila}${s.col}`}
                              >
                                {s.fila}{s.col}
                              </div>
                            );
                          });
                        })}
                      </div>

                      {/* Pantalla */}
                      <div className="cf-screen">PANTALLA</div>
                    </>
                  )}

                  {/* Resumen */}
                  <div className="cf-summary">
                    <h3 className="cf-h3">Resumen de la compra</h3>
                    {!funcionSel || seleccionados.length === 0 ? (
                      <p className="cf-muted">Selecciona un horario y asientos para ver el resumen.</p>
                    ) : (
                      <>
                        <p><strong>Película:</strong> {peliculaSel?.titulo}</p>
                        <p><strong>Horario:</strong> {funcionSel.horaInicio}</p>
                        <p><strong>Sala:</strong> {funcionSel.salaNombre}</p>
                        <p>
                          <strong>Asientos:</strong>{' '}
                          {seleccionados.map((k) => {
                            const [ff, cc] = k.split('-');
                            return `${ff}${cc}`;
                          }).join(', ')}
                        </p>
                        <p><strong>Cantidad:</strong> {seleccionados.length} boleto(s)</p>
                        <hr />
                        <p className="cf-total"><strong>Total:</strong> {currency(total)}</p>
                      </>
                    )}
                  </div>

                  {/* Pago */}
                  <h3 className="cf-h3">Método de pago</h3>
                  <div className="cf-payment-methods">
                    <button
                      className={`cf-payment-method ${metodoPago === 'tarjeta' ? 'selected' : ''}`}
                      onClick={() => setMetodoPago('tarjeta')}
                    >
                      <strong>Tarjeta de crédito</strong>
                      <p>Visa, MasterCard, American Express</p>
                    </button>
                    <button
                      className={`cf-payment-method ${metodoPago === 'paypal' ? 'selected' : ''}`}
                      onClick={() => setMetodoPago('paypal')}
                    >
                      <strong>PayPal</strong>
                      <p>Pago seguro con tu cuenta PayPal</p>
                    </button>
                    <button
                      className={`cf-payment-method ${metodoPago === 'efectivo' ? 'selected' : ''}`}
                      onClick={() => setMetodoPago('efectivo')}
                    >
                      <strong>Pagar en taquilla</strong>
                      <p>Realiza el pago antes de la función</p>
                    </button>
                  </div>

                  <button
                    className="cf-confirm-btn"
                    disabled={!funcionSel || seleccionados.length === 0 || !metodoPago || submitting}
                    onClick={confirmarAccion}
                  >
                    {submitting
                      ? 'Procesando...'
                      : metodoPago === 'efectivo'
                      ? 'Reservar'
                      : 'Pagar ahora'}
                  </button>
                </main>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
