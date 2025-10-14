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

const addDays = (iso, d) => {
  const dt = new Date(iso + 'T00:00:00');
  dt.setDate(dt.getDate() + d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const rangeInclusive = (from, to) => {
  const dates = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
};

export default function ModalFuncionesMasivas({ open, onClose, onProgramar, initialDate }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [peliculas, setPeliculas] = useState([]);
  const [salas, setSalas] = useState([]);
  const [formatos, setFormatos] = useState([]);
  const [idiomas, setIdiomas] = useState([]);

  const [id_pelicula, setIdPelicula] = useState('');
  const [id_sala, setIdSala] = useState('');
  const [id_formato, setIdFormato] = useState('');
  const [id_idioma, setIdIdioma] = useState('');

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [dias, setDias] = useState({ // 0=Dom .. 6=Sáb (Date.getDay)
    1:true, 2:true, 3:true, 4:true, 5:true, // laborales por defecto
    0:false, 6:false
  });
  const [excluir, setExcluir] = useState([]);
  const [excluirInput, setExcluirInput] = useState('');

  const [horaInicio, setHoraInicio] = useState('');
  const [horaFinal, setHoraFinal] = useState('');
  const [precio, setPrecio] = useState('');
  const [allOrNothing, setAllOrNothing] = useState(false);

  const peliSel = useMemo(() =>
    peliculas.find(p => String(p.id) === String(id_pelicula)) || null
  ,[peliculas, id_pelicula]);

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

  useEffect(() => {
    if (!peliSel || !horaInicio) return;
    const fin = hhmmToMinutes(horaInicio) + Number(peliSel.duracion || 0);
    setHoraFinal(minutesToHHMM(fin));
  }, [peliSel, horaInicio]);

  const toggleDia = (idx) => setDias(d => ({ ...d, [idx]: !d[idx] }));

  const addExclusion = () => {
    if (!excluirInput) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(excluirInput)) {
      return toast.warn('Fecha a excluir inválida');
    }
    if (!excluir.includes(excluirInput)) setExcluir([...excluir, excluirInput]);
    setExcluirInput('');
  };
  const removeExclusion = (f) => setExcluir(excluir.filter(x => x !== f));

  const reset = () => {
    setIdPelicula(''); setIdSala(''); setIdFormato(''); setIdIdioma('');
    setDesde(''); setHasta('');
    setDias({1:true,2:true,3:true,4:true,5:true,0:false,6:false});
    setExcluir([]); setExcluirInput('');
    setHoraInicio(''); setHoraFinal(''); setPrecio('');
    setAllOrNothing(false);
  };

    useEffect(() => {
    if (!open) return;
    if (initialDate) {
      setDesde(initialDate);
      setHasta(initialDate);
      const d = new Date(initialDate + 'T00:00:00').getDay(); // 0..6
      setDias({0:false,1:false,2:false,3:false,4:false,5:false,6:false, [d]: true});
    }
  }, [open, initialDate]);

  const submit = async (e) => {
    e.preventDefault();

    if (!id_pelicula || !id_sala || !id_formato || !id_idioma)
      return toast.warn('Completa película, sala, formato e idioma');
    if (!desde || !hasta) return toast.warn('Selecciona rango de fechas');
    if (desde > hasta) return toast.warn('El rango de fechas es inválido');
    if (!horaInicio || !horaFinal) return toast.warn('Completa horas');
    if (Number(precio) < 0) return toast.warn('Precio inválido');

    // generar lista explícita de fechas
    const lista = rangeInclusive(desde, hasta).filter(f => {
      const d = new Date(f + 'T00:00:00').getDay(); // 0..6
      const okDia = Object.values(dias).some(Boolean) ? !!dias[d] : true;
      const okEx = !excluir.includes(f);
      return okDia && okEx;
    });

    if (lista.length === 0) return toast.warn('No hay fechas seleccionadas');
    if (lista.length > 200) return toast.warn('Demasiadas fechas (máx 200)');


    try {
      setSaving(true);
      const body = {
        id_pelicula, id_sala, id_formato, id_idioma,
        fechas: lista,
        horaInicio, horaFinal,
        precio,
        allOrNothing
      };
      const res = await axios.post(`${API_BASE}/api/funciones/bulk`, body);
      if (res?.status >= 200 && res?.status < 300) {
        const created = res.data?.created?.length || 0;
        const conflicts = res.data?.conflicts?.length || 0;
        const errors = res.data?.errors?.length || 0;

        toast.success(`Creadas: ${created} · Conflictos: ${conflicts} · Errores: ${errors}`);
        onProgramar?.();
        reset();
        onClose?.();
      } else {
        throw new Error(`status ${res?.status}`);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'No se pudo crear funciones masivas';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

   const fechasSeleccionadas = useMemo(() => {
  if (!desde || !hasta) return [];
  const rango = rangeInclusive(desde, hasta);
  return rango.filter(f => {
    const d = new Date(f + 'T00:00:00').getDay();
    const okDia = Object.values(dias).some(Boolean) ? !!dias[d] : true;
    const okEx  = !excluir.includes(f);
    return okDia && okEx;
  });
}, [desde, hasta, dias, excluir]);
 

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Programar funciones</h5>
              <button type="button" className="btn-close" onClick={() => { reset(); onClose?.(); }} />
            </div>

            <form onSubmit={submit} noValidate>
              <div className="modal-body">
                {loading ? (
                  <div className="text-muted">Cargando catálogos…</div>
                ) : (
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label">Película</label>
                      <select className="form-select" value={id_pelicula} onChange={e => setIdPelicula(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {peliculas.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                      </select>
                      {peliSel?.duracion ? (<small className="text-muted">Duración: {peliSel.duracion} min</small>) : null}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label">Sala</label>
                      <select className="form-select" value={id_sala} onChange={e => setIdSala(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    </div>

                    <div className="col-md-3">
                      <label className="form-label">Formato</label>
                      <select className="form-select" value={id_formato} onChange={e => setIdFormato(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {formatos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                    </div>

                    <div className="col-md-3">
                      <label className="form-label">Idioma</label>
                      <select className="form-select" value={id_idioma} onChange={e => setIdIdioma(e.target.value)} required>
                        <option value="">Seleccione…</option>
                        {idiomas.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                      </select>
                    </div>

                    {/* Rango de fechas */}
                    <div className="col-md-6">
                      <label className="form-label">Desde</label>
                      <input type="date" className="form-control" value={desde} onChange={e => setDesde(e.target.value)} required />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Hasta</label>
                      <input type="date" className="form-control" value={hasta} onChange={e => setHasta(e.target.value)} required />
                    </div>

                    {/* Días de la semana */}
                    <div className="col-12">
                      <label className="form-label d-block">Días de la semana</label>
                      <div className="d-flex flex-wrap gap-2">
                        {[
                          {i:1, t:'Lun'}, {i:2, t:'Mar'}, {i:3, t:'Mié'},
                          {i:4, t:'Jue'}, {i:5, t:'Vie'}, {i:6, t:'Sáb'},
                          {i:0, t:'Dom'}
                        ].map(d => (
                          <button key={d.i} type="button"
                                  className={`btn btn-sm ${dias[d.i] ? 'btn-primary' : 'btn-outline-secondary'}`}
                                  onClick={() => toggleDia(d.i)}>
                            {d.t}
                          </button>
                        ))}
                        <small className="text-muted ms-2">Si no seleccionas ninguno, se tomarán todos los días.</small>
                      </div>
                    </div>

                    {/* Excluir fechas */}
                    <div className="col-12">
                      <label className="form-label d-block">Excluir fechas</label>
                      <div className="d-flex gap-2">
                        <input type="date" className="form-control w-auto" value={excluirInput} onChange={e => setExcluirInput(e.target.value)} />
                        <button type="button" className="btn btn-outline-secondary" onClick={addExclusion}>Añadir</button>
                      </div>
                      <div className="mt-2 d-flex flex-wrap gap-2">
                        {excluir.map(f => (
                          <span key={f} className="badge bg-light text-dark">
                            {f} <button type="button" className="btn btn-sm btn-link" onClick={() => removeExclusion(f)}>x</button>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Horas y precio */}
                    <div className="col-md-4">
                      <label className="form-label">Hora inicio</label>
                      <input type="time" className="form-control" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Hora final</label>
                      <input type="time" className="form-control" value={horaFinal} onChange={e => setHoraFinal(e.target.value)} required />
                      <small className="text-muted">Se sugiere según la duración</small>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">Precio</label>
                      <div className="input-group">
                        <span className="input-group-text">Q</span>
                        <input type="number" step="0.01" min="0" className="form-control"
                               value={precio} onChange={e => setPrecio(e.target.value)} required />
                      </div>
                    </div>

                    <div className="col-12">
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="allOrNothing"
                               checked={allOrNothing} onChange={(e) => setAllOrNothing(e.target.checked)} />
                        <label className="form-check-label" htmlFor="allOrNothing">
                          Todo o nada (si existe un conflicto, no se creará ninguna función)
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <small className="me-auto text-muted">
                    {fechasSeleccionadas.length} fecha(s) seleccionada(s)
                </small>
                <button type="button" className="btn btn-outline-secondary" onClick={() => { reset(); onClose?.(); }}>
                    Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || !fechasSeleccionadas.length}>
                    {saving ? 'Guardando…' : 'Crear funciones'}
                </button>
             </div>
            </form>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      <div className="modal-backdrop fade show" />
    </>
  );
}
