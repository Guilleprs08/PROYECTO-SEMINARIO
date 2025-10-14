import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const hhmmToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const minutesToHHMM = (min) => {
  let m = Math.max(0, min % (24 * 60));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${String(h).padStart(2, '0')}:${mm}`;
};

/* ============================
   Viewer de asientos (solo lectura)
   ============================ */
function FunctionSeatMap({ funcionId }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState(0);
  const [cols, setCols] = useState(0);
  const [first, setFirst] = useState('A');

  useEffect(() => {
    if (!funcionId) return;
    axios.get(`${API_BASE}/api/funciones/${funcionId}/asientos`)
      .then(({ data }) => {
        if (!Array.isArray(data) || !data.length) { setData([]); setRows(0); setCols(0); return; }
        const letras = [...new Set(data.map(x => x.fila))].sort();
        const minL = letras[0], maxL = letras[letras.length-1];
        const maxC = Math.max(...data.map(x => Number(x.columna)));
        setFirst(minL);
        setRows(maxL.charCodeAt(0) - minL.charCodeAt(0) + 1);
        setCols(maxC);
        setData(data);
      })
      .catch(() => setData([]));
  }, [funcionId]);

  return (
    <div className="p-2">
      <style>{`
        :root { --seat: 32px; --gap: 6px; }
        @media (max-width: 1400px){ :root{ --seat: 28px; --gap: 5px; } }
        .fmap-wrap{display:flex;justify-content:center}
        .fmap-grid{display:grid;grid-template-columns:40px repeat(${cols},var(--seat));gap:var(--gap)}
        .fmap-seat{width:var(--seat);height:var(--seat);border-radius:10px;border:1px solid #d1d5db;
          display:flex;align-items:center;justify-content:center;font-size:.8rem;user-select:none}
        .fmap-normal{background:#60a5fa;color:#fff}
        .fmap-pmr{background:#111827;color:#fff}
        .fmap-resv{background:#ffd65a;color:#fff}
        .fmap-bloq{background:#a3a3a3;color:#fff}
        .fmap-vend{background:#f87171;color:#fff}
        .fmap-empty{background:#f3f4f6}
        .fmap-row{line-height:var(--seat);font-weight:600;color:#6b7280;text-align:right}
        .fmap-screenText{grid-column:2/-1;text-align:center;margin-top:14px;color:#6b7280;font-size:.9rem}
        .fmap-screen{height:8px;background:#e5e7eb;border-radius:4px;grid-column:2/-1;margin:6px 0 10px}
      `}</style>

      <div className="mb-2 small text-muted">Mapa de asientos (solo lectura)</div>
      {!data || rows===0 ? (
        <div className="small text-muted">Sin asientos para mostrar</div>
      ) : (
        <div className="fmap-wrap">
          <div className="fmap-grid">
            <div />
            {Array.from({length: cols}).map((_,c)=><div key={`c${c}`} className="text-center small text-muted">{c+1}</div>)}
            {Array.from({length: rows}).map((_,r)=>{
              const letra = String.fromCharCode(first.charCodeAt(0)+r);
              const rowData = (data||[]).filter(x=>x.fila===letra);
              const byCol = new Map(rowData.map(x=>[Number(x.columna), x]));
              return (
                <React.Fragment key={`r${r}`}>
                  <div className="fmap-row">{letra}</div>
                  {Array.from({length: cols}).map((_,c)=>{
                    const seat = byCol.get(c+1);
                    const cls = !seat
                      ? 'fmap-empty'
                      : seat.estado === 'RESERVADO' ? 'fmap-resv'
                      : seat.estado === 'BLOQUEADO' ? 'fmap-bloq'
                      : seat.estado === 'VENDIDO' ? 'fmap-vend'
                      : (seat.tipo === 'PMR' ? 'fmap-pmr' : 'fmap-normal');
                    return <div key={`s${r}-${c}`} className={`fmap-seat ${cls}`} />;
                  })}
                </React.Fragment>
              );
            })}
            <div className="fmap-screenText">Pantalla</div>
            <div className="fmap-screen" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModalAsignarFuncion({
  open,
  onClose,
  modo = 'crear',
  registro = null,
  onProgramar
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const [peliculas, setPeliculas] = useState([]);
  const [salas,     setSalas]     = useState([]);
  const [formatos,  setFormatos]  = useState([]);
  const [idiomas,   setIdiomas]   = useState([]);

  // form
  const [id_pelicula, setIdPelicula] = useState('');
  const [id_sala,     setIdSala]     = useState('');
  const [id_formato,  setIdFormato]  = useState('');
  const [id_idioma,   setIdIdioma]   = useState('');

  const [fecha,       setFecha]      = useState('');
  const [horaInicio,  setHoraInicio] = useState('');
  const [horaFinal,   setHoraFinal]  = useState('');
  const [precio,      setPrecio]     = useState('');

  const peliSel = useMemo(() => peliculas.find(p => String(p.id) === String(id_pelicula)) || null, [peliculas, id_pelicula]);

  const [hasVentas, setHasVentas] = useState(false);

  const handleDelete = async () => {
    if (!registro?.id) return;
    try {
      setDeleting(true);
      await axios.delete(`${API_BASE}/api/funciones/${registro.id}`);
      toast.success('Función cancelada');
      reset();
      onClose?.();
      onProgramar?.();
    } catch (e) {
      toast.error('No se pudo cancelar');
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  useEffect(() => {
  let cancel = false;
  const load = async () => {
    if (open && modo === 'editar' && registro?.id) {
      try {
        const { data } = await axios.get(`${API_BASE}/api/funciones/${registro.id}/has-ventas`);
        if (!cancel) setHasVentas(!!data?.hasVentas);
      } catch {
        if (!cancel) setHasVentas(false);
      }
    } else {
      setHasVentas(false);
    }
  };
  load();
  return () => { cancel = true; };
}, [open, modo, registro?.id]);

  // Catálogos
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    axios.get(`${API_BASE}/api/funciones/select-data`)
      .then(({ data }) => {
        setPeliculas(data.peliculas || []);
        setSalas(data.salas || []);
        setFormatos(data.formatos || []);
        setIdiomas(data.idiomas || []);
      })
      .catch(() => toast.error('No se pudieron cargar los catálogos'))
      .finally(() => setLoading(false));
  }, [open]);

  // Sugerir hora fin por duración
  useEffect(() => {
    if (!peliSel || !horaInicio) return;
    const fin = hhmmToMinutes(horaInicio) + Number(peliSel.duracion || 0);
    setHoraFinal(minutesToHHMM(fin));
  }, [peliSel, horaInicio]);

  // Precargar en modo editar
  useEffect(() => {
    if (!open) return;
    if (modo === 'editar' && registro) {
      setIdPelicula(String(registro.peliculaId ?? ''));
      setIdSala(String(registro.salaId ?? ''));
      setIdFormato(String(registro.formatoId ?? ''));
      setIdIdioma(String(registro.idiomaId ?? ''));
      setFecha(registro.fecha ?? '');
      setHoraInicio(registro.horaInicio ?? '');
      setHoraFinal(registro.horaFinal ?? '');
      setPrecio(String(registro.precio ?? ''));
    }
  }, [open, modo, registro]);

  const reset = () => {
    setIdPelicula(''); setIdSala(''); setIdFormato(''); setIdIdioma('');
    setFecha(''); setHoraInicio(''); setHoraFinal(''); setPrecio('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!id_pelicula || !id_sala || !id_formato || !id_idioma)
      return toast.warn('Completa película, sala, formato e idioma');
    if (!fecha || !horaInicio || !horaFinal)
      return toast.warn('Completa fecha y horas');
    if (Number(precio) < 0)
      return toast.warn('Precio inválido');

    const ini = hhmmToMinutes(horaInicio);
    const fin = hhmmToMinutes(horaFinal);
    const finAdj = fin <= ini ? fin + 1440 : fin;
    const dur = finAdj - ini;
    if (dur <= 0) return toast.warn('La hora final debe ser mayor a la inicial');
    if (dur > 1440) return toast.warn('Duración inválida');

    try {
      setSaving(true);

      if (modo === 'editar' && registro?.id) {
      try {
        const { data } = await axios.get(`${API_BASE}/api/funciones/${registro.id}/has-ventas`);
        if (data?.hasVentas) {
          toast.error('No se puede editar: la función ya tiene tickets vendidos');
          return; // <- NO seguimos a PUT
        }
      } catch {
        // Si falla el check, no bloquees; el backend igual validará con 409.
      }
    }

      const body = { id_pelicula, id_sala, id_formato, id_idioma, fecha, horaInicio, horaFinal, precio };
      let res;
      if (modo === 'editar' && registro?.id) {
        res = await axios.put(`${API_BASE}/api/funciones/${registro.id}`, body);
      } else {
        res = await axios.post(`${API_BASE}/api/funciones`, body);
      }
      if (!res || res.status < 200 || res.status >= 300) throw new Error(`status ${res?.status}`);

      toast.success(modo === 'editar' ? 'Función actualizada' : 'Función creada');
      onProgramar?.();
      reset();
      onClose?.();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message ||
                  (modo === 'editar' ? 'No se pudo actualizar la función' : 'No se pudo crear la función');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        {/* ANCHO: casi pantalla completa */}
        <div
          className="modal-dialog modal-dialog-scrollable"
          style={{ '--bs-modal-width': 'min(95vw, 1280px)' }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Programar función</h5>
              <button type="button" className="btn-close" onClick={() => { reset(); onClose?.(); }} />
            </div>

            {hasVentas && (
              <div className="alert alert-warning d-flex align-items-start" role="alert">
                <i className="fas fa-info-circle me-2 mt-1" />
                <div>
                  Esta función ya tiene <strong>tickets vendidos</strong>. Puedes revisar los campos,
                  pero <strong>no podrás guardar cambios ni cancerlar la función</strong>.
                </div>
              </div>
            )}


            <form onSubmit={submit} noValidate>
              {/* ALTURA mayor y sin scroll horizontal */}
              <div className="modal-body" style={{ overflowX: 'hidden', maxHeight: '75vh' }}>
                {loading ? (
                  <div className="text-muted">Cargando catálogos…</div>
                ) : (
                  <div className="row">
                    {/* Columna formulario (6/12) */}
                    <div className="col-12 col-xl-6">
                      <div className="row g-3">
                        {/* Película */}
                        <div className="col-12">
                          <label className="form-label">Película</label>
                          <select className="form-select" value={id_pelicula} onChange={e => setIdPelicula(e.target.value)} required>
                            <option value="">Seleccione…</option>
                            {peliculas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                          </select>
                          {peliSel?.duracion ? <small className="text-muted">Duración: {peliSel.duracion} min</small> : null}
                        </div>

                        {/* Sala */}
                        <div className="col-md-6">
                          <label className="form-label">Sala</label>
                          <select className="form-select" value={id_sala} onChange={e => setIdSala(e.target.value)} required>
                            <option value="">Seleccione…</option>
                            {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                          </select>
                        </div>

                        {/* Formato */}
                        <div className="col-md-3">
                          <label className="form-label">Formato</label>
                          <select className="form-select" value={id_formato} onChange={e => setIdFormato(e.target.value)} required>
                            <option value="">Seleccione…</option>
                            {formatos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                          </select>
                        </div>

                        {/* Idioma */}
                        <div className="col-md-3">
                          <label className="form-label">Idioma</label>
                          <select className="form-select" value={id_idioma} onChange={e => setIdIdioma(e.target.value)} required>
                            <option value="">Seleccione…</option>
                            {idiomas.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                          </select>
                        </div>

                        {/* Fecha y horas */}
                        <div className="col-md-4">
                          <label className="form-label">Fecha</label>
                          <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)} required />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Hora inicio</label>
                          <input type="time" className="form-control" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} required />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label">Hora final</label>
                          <input type="time" className="form-control" value={horaFinal} onChange={e => setHoraFinal(e.target.value)} required />
                          <small className="text-muted">Se sugiere según la duración</small>
                        </div>

                        {/* Precio */}
                        <div className="col-md-4">
                          <label className="form-label">Precio</label>
                          <div className="input-group">
                            <span className="input-group-text">Q</span>
                            <input type="number" step="0.01" min="0" className="form-control"
                                   value={precio} onChange={e => setPrecio(e.target.value)} required />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Columna viewer (6/12) */}
                    <div className="col-12 col-xl-6 border-start">
                      {modo==='editar' && registro?.id ? (
                        <FunctionSeatMap funcionId={registro.id} />
                      ) : (
                        <div className="text-muted small p-3">
                          Guarda la función para visualizar su mapa de asientos.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => { reset(); onClose?.(); }}>
                  Cancelar
                </button>
                {modo === 'editar' && registro?.id && (
                  <button type="button" className="btn btn-outline-danger me-auto" onClick={() => setConfirmOpen(true)}>
                    Cancelar función
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar función'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Backdrop del modal */}
      <div className="modal-backdrop fade show" />

      {/* Confirm de eliminación */}
      {confirmOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1090 }} role="dialog" aria-modal="true"
             onKeyDown={(e) => {
               if (e.key === 'Escape' && !deleting) setConfirmOpen(false);
               if (e.key === 'Enter'  && !deleting) handleDelete();
             }}>
          <div className="w-100 h-100 bg-dark bg-opacity-50" onClick={() => !deleting && setConfirmOpen(false)} />
          <div className="position-absolute top-50 start-50 translate-middle" style={{ minWidth: 380 }}>
            <div className="card shadow-lg rounded-3">
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="rounded-circle bg-danger bg-opacity-10 p-2">
                    <i className="fas fa-exclamation-triangle text-danger"></i>
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="fw-semibold mb-1">¿Cancelar esta función?</h6>
                    <p className="text-muted small mb-0">
                      Se eliminará de la sala y el horario seleccionados. Esta acción no se puede deshacer.
                    </p>
                  </div>
                </div>
                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirmOpen(false)} disabled={deleting} autoFocus>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Cancelando…' : 'Cancelar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
