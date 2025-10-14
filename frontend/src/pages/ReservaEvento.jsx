// src/pages/ReservaEvento.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useLayoutEffect,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/clientecartelera.css';

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ================== Auth / Axios helpers ================== */
const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const get = (p, cfg = {}) =>
  axios.get(`${API_BASE}${p}`, { headers: { ...authHeaders() }, ...cfg });
const post = (p, body, cfg = {}) =>
  axios.post(`${API_BASE}${p}`, body, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...cfg,
  });

/* ================== Sesión (clienteId y email) ================== */
const getClienteId = () => {
  const v = localStorage.getItem('clienteId');
  return v ? Number(v) : null;
};
const getEmail = () => {
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

/* ================== Utils ================== */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0,0,0,0); return x; };
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function ReservaEvento() {
  const navigate = useNavigate();

  /* ===== Fix global de scroll ===== */
  const GlobalFix = () => (
    <style>{`
      html, body, #root { height:auto!important; min-height:100%!important; overflow-y:auto!important; overflow-x:hidden!important; }
      .re-page { position:relative; display:block; min-height:100%!important; height:auto!important; overflow:visible!important; }
      .cf-modal { overflow:visible; }
      body { margin-top:0!important; padding-top:0!important; }
      :focus { scroll-margin-top:0!important; }
    `}</style>
  );

  const pageRef = useRef(null);
  const forceTop = () => {
    try { window.history.scrollRestoration = 'manual'; } catch {}
    if (document.activeElement && document.activeElement !== document.body) {
      try { document.activeElement.blur(); } catch {}
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (pageRef.current) pageRef.current.scrollTop = 0;
  };
  useLayoutEffect(() => {
    forceTop();
    const a = setTimeout(forceTop, 32);
    const b = setTimeout(forceTop, 150);
    const c = setTimeout(forceTop, 400);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, []);

  // ---- regla: mínimo 3 días de anticipación
  const minDate = useMemo(() => ymd(addDays(new Date(), 3)), []);

  // ---- estado del formulario
  const [salas, setSalas] = useState([]);
  const [salaId, setSalaId] = useState('');
  const [fecha, setFecha] = useState(minDate);
  const [horaInicio, setHoraInicio] = useState('');
  const [duracion, setDuracion] = useState(120);
  const [personas, setPersonas] = useState('');
  const [notas, setNotas] = useState('');

  // === NUEVOS CAMPOS ===
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');

  // ---- estado UI
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ---- modal de confirmación (ahora para solicitud)
  const [okModal, setOkModal] = useState(false);

  // ---- modal de horarios disponibles
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsData, setSlotsData] = useState(null);

  // Identidad del usuario
  const clienteId = useMemo(() => getClienteId(), []);
  const email = useMemo(() => getEmail(), []);

  // Cargar salas
  useEffect(() => {
    (async () => {
      try {
        const { data } = await get('/api/salas');
        const list = Array.isArray(data) ? data : [];
        const norm = list
          .map((s) => ({
            id: s.id ?? s.id_sala ?? s.ID ?? s.ID_SALA,
            nombre: s.nombre ?? s.NOMBRE ?? `Sala ${s.id ?? s.id_sala ?? ''}`,
            capacidad: Number(s.capacidad ?? s.CAPACIDAD ?? 0),
            formato: s.formato ?? s.FORMATO ?? null,
          }))
          .filter((x) => x.id);
        setSalas(norm);
      } catch {
        setSalas([]);
      }
    })();

    // Autocompletar nombre si viene en mf_user
    try {
      const raw = localStorage.getItem('mf_user');
      if (raw) {
        const u = JSON.parse(raw);
        const nom =
          [u?.name,
           (u?.given_name && u?.family_name) ? `${u.given_name} ${u.family_name}` : null,
           u?.given_name]
          .filter(Boolean)[0];
        if (nom) setNombre(nom);
      }
    } catch {}
  }, []);

  const salaSel = useMemo(
    () => salas.find((s) => String(s.id) === String(salaId)) || null,
    [salas, salaId]
  );

  // ---- validaciones
  const validate = () => {
    if (!salaId) return 'Selecciona una sala.';
    if (!fecha) return 'Selecciona una fecha.';
    if (fecha < minDate)
      return `Debes solicitar con al menos 3 días de anticipación (mínimo ${minDate}).`;
    if (!horaInicio) return 'Selecciona la hora de inicio.';
    const n = Number(duracion);
    if (!n || n < 60) return 'La duración mínima del evento es de 60 minutos.';
    if (!nombre?.trim()) return 'Ingresa tu Nombre y Apellido.';
    if (!celular?.trim()) return 'Ingresa tu Número de celular.';
    if (personas && salaSel && Number(personas) > Number(salaSel.capacidad)) {
      return `La sala seleccionada tiene capacidad máxima de ${salaSel.capacidad} personas.`;
    }
    return null;
  };

  // ---- disponibilidad (solo informativa; la validación real será al APROBAR)
  const checkDisponibilidad = async () => {
    try {
      const qs = new URLSearchParams({
        fecha,
        salaId,
        horaInicio,
        duracionMin: String(duracion),
      }).toString();
      const { data } = await get(`/api/eventos-reservados/disponibilidad?${qs}`);
      return !!data?.disponible;
    } catch {
      return null;
    }
  };

  // ---- ver horarios disponibles (slots)
  const verHorariosDisponibles = async () => {
    if (!salaId) return setErrorMsg('Selecciona una sala.');
    if (!fecha) return setErrorMsg('Selecciona una fecha.');

    setSlotsLoading(true);
    setSlotsOpen(true);
    try {
      const qs = new URLSearchParams({
        salaId,
        fecha,
        duracionMin: String(duracion),
        open: '10:00',
        close: '22:00',
        stepMin: '30',
      }).toString();
      const { data } = await get(`/api/eventos-reservados/slots?${qs}`);
      setSlotsData(data);
    } catch (e) {
      const serverMsg =
        (e?.response?.data?.detail && `${e.response.data.message}: ${e.response.data.detail}`) ||
        e?.response?.data?.message ||
        e?.message ||
        'No se pudieron cargar los horarios.';
      setSlotsData({ error: true, message: serverMsg });
    } finally {
      setSlotsLoading(false);
    }
  };

  // ==== SOLICITAR RESERVA (NO crea evento real) ====
  const solicitar = async () => {
    const v = validate();
    if (v) {
      setErrorMsg(v);
      return;
    }

    setLoading(true);
    try {
      // Disponibilidad sólo para orientar al usuario (el admin valida al aprobar)
      const disponible = await checkDisponibilidad();
      if (disponible === false) {
        setErrorMsg('La sala parece ocupada en ese horario. Igual puedes enviar la solicitud.');
        // no return; dejamos enviar la solicitud por si el admin reubica
      }

      // agregar tag [UEMAIL:...] si falta
      let notasEnv = (notas || '').trim();
      if (email && !/\[UEMAIL:.*?\]/.test(notasEnv)) {
        notasEnv = `${notasEnv} [UEMAIL:${email}]`.trim();
      }

      const payload = {
        salaId: Number(salaId),
        fecha,
        horaInicio,
        duracionMin: Number(duracion),
        personas: personas ? Number(personas) : null,
        nombre: nombre.trim(),
        celular: celular.trim(),
        notas: notasEnv || null,
        clienteId,   // opcional
        email,       // opcional
      };

      const { data } = await post('/api/solicitudes', payload);
      if (data?.ok) {
        setOkModal(true);
        // Resetea lo mínimo (dejamos sala/fecha si quiere enviar otra)
        setNotas('');
      } else {
        setErrorMsg('No se pudo enviar la solicitud.');
      }
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        'Error enviando la solicitud';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // limpiar errores en pantalla
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(''), 3000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  return (
    <>
      <GlobalFix />
      <main className="re-page" ref={pageRef}>
        <div className="cf-bg">
          <div className="cf-container">
            <header className="cf-header">
              <h1>🎬 Solicitud de reserva de evento</h1>
              <p>Envía tu solicitud para usar una sala en una fecha y hora específicas.</p>
            </header>

            {/* Aviso de regla */}
            <section className="cf-evt-hint" role="note" aria-live="polite">
              <div className="cf-evt-hint-inner">
                <strong>Importante:</strong> Debes solicitar con <strong>mínimo 3 días</strong> de
                anticipación. Si la solicitud es <b>aprobada</b>, se creará tu reserva oficial.
              </div>
            </section>

            <section className="cf-evt-wrap">
              {/* Formulario */}
              <div className="cf-evt-card cf-evt-form" role="form" aria-labelledby="evtFormTitle">
                <h3 id="evtFormTitle">📝 Datos de la solicitud</h3>

                <div className="cf-evt-grid">
                  <div className="cf-evt-field">
                    <label htmlFor="salaSel">Sala</label>
                    <select id="salaSel" value={salaId} onChange={(e) => setSalaId(e.target.value)}>
                      <option value="">Selecciona una sala…</option>
                      {salas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre} {s.formato ? `· ${s.formato}` : ''}{' '}
                          {s.capacidad ? `· ${s.capacidad} pax` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="cf-evt-field">
                    <label htmlFor="fechaEvt">Fecha del evento</label>
                    <input
                      id="fechaEvt"
                      type="date"
                      min={minDate}
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                    />
                    <small>Mínimo {minDate}</small>
                  </div>

                  <div className="cf-evt-field">
                    <label htmlFor="horaEvt">Hora de inicio</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="horaEvt"
                        type="time"
                        value={horaInicio}
                        onChange={(e) => setHoraInicio(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="cf-btn"
                        onClick={verHorariosDisponibles}
                        disabled={!salaId || !fecha || !duracion}
                        title={!salaId || !fecha ? 'Selecciona sala y fecha primero' : 'Ver horarios sugeridos'}
                      >
                        🕑 Ver horarios
                      </button>
                    </div>
                    <small>Horario de operación: 10:00–22:00</small>
                  </div>

                  <div className="cf-evt-field">
                    <label htmlFor="duracionEvt">Duración (minutos)</label>
                    <select id="duracionEvt" value={duracion} onChange={(e) => setDuracion(e.target.value)}>
                      {[90, 120, 150, 180, 210, 240].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="cf-evt-field">
                    <label htmlFor="personasEvt">Personas (opcional)</label>
                    <input
                      id="personasEvt"
                      type="number"
                      min="1"
                      placeholder="Ej. 60"
                      value={personas}
                      onChange={(e) => setPersonas(e.target.value)}
                    />
                    {salaSel?.capacidad ? (
                      <small>Capacidad máx.: {salaSel.capacidad}</small>
                    ) : null}
                  </div>

                  {/* ===== Nuevos campos ===== */}
                  <div className="cf-evt-field">
                    <label htmlFor="nombreEvt">Nombre y Apellido</label>
                    <input
                      id="nombreEvt"
                      type="text"
                      placeholder="Ej. Juan Pérez"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                  </div>

                  <div className="cf-evt-field">
                    <label htmlFor="celEvt">Número de celular</label>
                    <input
                      id="celEvt"
                      type="tel"
                      placeholder="Ej. 50212345678"
                      value={celular}
                      onChange={(e) => setCelular(e.target.value)}
                    />
                  </div>

                  <div className="cf-evt-field cf-evt-field--full">
                    <label htmlFor="notasEvt">Notas (opcional)</label>
                    <textarea
                      id="notasEvt"
                      rows={3}
                      placeholder="Detalles del evento, requerimientos, etc."
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                    />
                  </div>
                </div>

                {errorMsg ? <div className="cf-evt-error" role="alert">{errorMsg}</div> : null}

                <div className="cf-evt-actions">
                  <button
                    className="cf-btn cf-btn-lg cf-btn-primary"
                    disabled={loading}
                    onClick={solicitar}
                  >
                    {loading ? 'Enviando…' : '📨 Solicitar reserva'}
                  </button>
                  <button className="cf-btn" onClick={() => navigate('/bienvenida-cliente')}>
                    ⬅️ Volver
                  </button>
                  <button className="cf-btn" onClick={() => navigate('/mis-reservas')}>
                    📒 Mis reservas
                  </button>
                </div>
              </div>

              {/* Resumen */}
              <aside className="cf-evt-card cf-evt-summary" role="complementary" aria-labelledby="evtSummaryTitle">
                <h3 id="evtSummaryTitle">📋 Resumen</h3>
                <ul>
                  <li><strong>Sala:</strong> {salaSel ? `${salaSel.nombre}${salaSel.formato ? ' · ' + salaSel.formato : ''}` : '—'}</li>
                  <li><strong>Fecha:</strong> {fecha || '—'}</li>
                  <li><strong>Inicio:</strong> {horaInicio || '—'}</li>
                  <li><strong>Duración:</strong> {duracion} min</li>
                  <li>
                    <strong>Personas:</strong> {personas || '—'}
                    {salaSel?.capacidad ? ` (máx. ${salaSel.capacidad})` : ''}
                  </li>
                  <li><strong>Nombre:</strong> {nombre || '—'}</li>
                  <li><strong>Celular:</strong> {celular || '—'}</li>
                </ul>
                <p className="cf-evt-note">
                  Tu solicitud será revisada por un administrador. Si es <b>aprobada</b>, se creará tu reserva.
                </p>
              </aside>
            </section>
          </div>

          {/* Modal de confirmación de SOLICITUD */}
          {okModal && (
            <div className="cf-modal" onClick={() => setOkModal(false)}>
              <div className="cf-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="cf-close" onClick={() => setOkModal(false)}>×</button>
                <div className="cf-modal-header">
                  <h2>✅ ¡Solicitud enviada!</h2>
                  <p>
                    Hemos recibido tu solicitud. Podrás ver su estado en <b>“Mis solicitudes”</b
                    > (la agregaremos en el siguiente paso) y también se reflejará en <b>Mis reservas</b> si es aprobada.
                  </p>
                </div>
                <div className="cf-modal-body">
                  <div className="cf-evt-modal-actions">
                    <button className="cf-btn cf-btn-primary" onClick={() => { setOkModal(false); navigate('/bienvenida-cliente'); }}>
                      🏠 Ir a Bienvenida
                    </button>
                    <button className="cf-btn" onClick={() => { setOkModal(false); }}>
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal de horarios disponibles */}
          {slotsOpen && (
            <div className="cf-modal" onClick={() => setSlotsOpen(false)}>
              <div className="cf-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="cf-close" onClick={() => setSlotsOpen(false)}>×</button>
                <div className="cf-modal-header">
                  <h2>🕑 Horarios disponibles</h2>
                  <p>
                    {slotsData?.fecha ? <>Fecha: <strong>{slotsData.fecha}</strong></> : null}
                    {slotsData?.duracionMin ? <> · Duración: <strong>{slotsData.duracionMin} min</strong></> : null}
                  </p>
                  {!slotsLoading && slotsData?.allowReserve === false ? (
                    <div className="cf-evt-error" style={{ marginTop: 8 }}>
                      Esta fecha no cumple la regla de mínimo 3 días (mínimo {slotsData?.minDay}). Puedes ver horarios,
                      pero no podrás reservar hasta esa fecha mínima.
                    </div>
                  ) : null}
                </div>

                <div className="cf-modal-body">
                  {slotsLoading ? (
                    <p>Cargando horarios…</p>
                  ) : slotsData?.error ? (
                    <p>{slotsData.message}</p>
                  ) : (
                    <>
                      {slotsData?.ocupados?.length ? (
                        <p style={{ marginBottom: 8 }}>
                          Ocupados del día: {slotsData.ocupados.map(o => `${o.start}-${o.end}`).join(', ')}
                        </p>
                      ) : null}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(slotsData?.disponibles || []).map((h) => (
                          <button
                            key={h}
                            className="cf-btn"
                            onClick={() => { setHoraInicio(h); setSlotsOpen(false); }}
                            title={`Empezar a las ${h}`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>

                      {(!slotsData?.disponibles || slotsData.disponibles.length === 0) && (
                        <div className="cf-evt-error" style={{ marginTop: 12 }}>
                          No hay horarios disponibles con la duración seleccionada entre {slotsData?.open} y {slotsData?.close}.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
