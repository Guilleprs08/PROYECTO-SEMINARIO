// src/components/ModalEventoReservado.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const toLocalDate = (d) => {
  const p = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
const toLocalTime = (d) => {
  const p = (n)=>String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ModalEventoReservado({
  open,
  onClose,
  salas = [],
  initialDate = '',
  modo = 'crear',         // 'crear' | 'editar'
  registro = null,        // {id,...}
  onGuardado,
  onEliminado
}) {
  const baseDate = useMemo(() => {
    if (initialDate) return new Date(`${initialDate}T10:00:00`);
    const d = new Date(); d.setMinutes(0,0,0); d.setHours(10); return d;
  }, [initialDate]);

  const [salaId, setSalaId] = useState(salas?.[0]?.id ?? '');
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(toLocalDate(baseDate));
  const [horaInicio, setHoraInicio] = useState(toLocalTime(baseDate));
  const [horaFinal, setHoraFinal] = useState(toLocalTime(new Date(baseDate.getTime()+2*60*60*1000)));
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [contactoEmail, setContactoEmail] = useState('');
  const [guardando, setGuardando] = useState(false);

  // === confirm de eliminación ===
  const [confirmOpen, setConfirmOpen] = useState(false);
  const abrirConfirm = () => setConfirmOpen(true);

  // === candado para sala/fecha/horas ===
  const [lockHorario, setLockHorario] = useState(modo === 'editar');
  useEffect(() => setLockHorario(modo === 'editar'), [modo]);

  const confirmarCancelacion = async () => {
    if (!(modo === 'editar' && registro?.id)) return;
    setGuardando(true);
    try {
      await axios.patch(`${API_BASE}/api/eventos-reservados/${registro.id}/cancel`);
      toast.success('Evento cancelado');
      setConfirmOpen(false);
      onEliminado?.();
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo cancelar el evento';
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  // Prefill al editar/crear
  useEffect(() => {
    if (modo === 'editar' && registro) {
      setSalaId(registro.salaId ?? salas?.[0]?.id ?? '');
      setTitulo(registro.titulo || '');
      setTipo(registro.tipo || '');
      setDescripcion(registro.descripcion || '');
      setFecha(registro.fecha || toLocalDate(baseDate));
      setHoraInicio((registro.horaInicio || '').slice(0,5) || '10:00');
      setHoraFinal((registro.horaFinal || '').slice(0,5) || '12:00');
      setContactoNombre(registro.contactoNombre || '');
      setContactoTelefono(registro.contactoTelefono || '');
      setContactoEmail(registro.contactoEmail || '');
    } else {
      setSalaId(salas?.[0]?.id ?? '');
      setTitulo(''); setTipo(''); setDescripcion('');
      setFecha(toLocalDate(baseDate));
      setHoraInicio(toLocalTime(baseDate));
      setHoraFinal(toLocalTime(new Date(baseDate.getTime()+2*60*60*1000)));
      setContactoNombre(''); setContactoTelefono(''); setContactoEmail('');
    }
  }, [modo, registro, salas, baseDate]);

  const validar = () => {
    if (!salaId) return 'Selecciona una sala.';
    if (!titulo.trim()) return 'El título es obligatorio.';
    if (!fecha) return 'Selecciona la fecha.';
    if (!horaInicio || !horaFinal) return 'Hora inicio y hora final son obligatorias.';
    if (horaFinal <= horaInicio) return 'La hora final debe ser mayor a la hora inicio.';
    return null;
  };

  const guardar = async () => {
    const err = validar(); if (err) return toast.warn(err);
    setGuardando(true);
    try {
      const payload = {
        salaId: Number(salaId),
        titulo: titulo.trim(),
        tipo: (tipo || 'Evento').trim(),
        descripcion: descripcion.trim() || null,
        fecha, horaInicio, horaFinal,
        contactoNombre: contactoNombre.trim() || null,
        contactoTelefono: contactoTelefono.trim() || null,
        contactoEmail: contactoEmail.trim() || null
      };

      if (modo === 'editar' && registro?.id) {
        await axios.put(`${API_BASE}/api/eventos-reservados/${registro.id}`, payload);
        toast.success('Evento actualizado');
      } else {
        await axios.post(`${API_BASE}/api/eventos-reservados`, payload);
        toast.success('Evento reservado creado');
      }
      onGuardado?.();
    } catch (e) {
      const msg = e?.response?.data?.message || 'No se pudo guardar el evento';
      toast.error(msg);
    } finally { setGuardando(false); }
  };

  if (!open) return null;

  return (
    <>
      <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
           style={{background:'rgba(0,0,0,0.35)', zIndex:1050}} role="dialog" aria-modal="true">
        <div className="bg-white rounded-3 shadow p-3" style={{ width: 'min(780px, 96vw)' }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="m-0">
              <i className="bi bi-calendar-plus me-2" />
              {modo === 'editar' ? 'Editar evento reservado' : 'Nuevo evento reservado'}
            </h5>
            <div className="d-flex align-items-center gap-2">
              {modo === 'editar' && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  title={lockHorario ? 'Desbloquear para editar sala/fecha/horas' : 'Bloquear sala/fecha/horas'}
                  onClick={() => setLockHorario(v => !v)}
                >
                  <i className={`bi ${lockHorario ? 'bi-lock' : 'bi-unlock'}`} />
                </button>
              )}
              <button className="btn btn-sm btn-light" onClick={onClose} disabled={guardando}>
                <i className="bi bi-x-lg"/>
              </button>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Sala</label>
              <select className="form-select" value={salaId}
                      onChange={e=>setSalaId(e.target.value)} disabled={modo==='editar' && lockHorario}>
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Tipo de evento (texto libre)</label>
              <input className="form-control" value={tipo} onChange={e=>setTipo(e.target.value)}
                     placeholder="Ej: Graduación, Mantenimiento, Ensayo…" />
            </div>

            <div className="col-12">
              <label className="form-label">Título</label>
              <input className="form-control" value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Ej: Graduación" />
            </div>

            <div className="col-12">
              <label className="form-label">Descripción (opcional)</label>
              <textarea className="form-control" rows={3} value={descripcion} onChange={e=>setDescripcion(e.target.value)} />
            </div>

            <div className="col-md-4">
              <label className="form-label">Fecha</label>
              <input type="date" className="form-control" value={fecha}
                     onChange={e=>setFecha(e.target.value)} disabled={modo==='editar' && lockHorario} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Hora inicio</label>
              <input type="time" className="form-control" value={horaInicio}
                     onChange={e=>setHoraInicio(e.target.value)} disabled={modo==='editar' && lockHorario} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Hora final</label>
              <input type="time" className="form-control" value={horaFinal}
                     onChange={e=>setHoraFinal(e.target.value)} disabled={modo==='editar' && lockHorario} />
            </div>

            <div className="col-md-4">
              <label className="form-label">Contacto (Nombre)</label>
              <input className="form-control" value={contactoNombre} onChange={e=>setContactoNombre(e.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Contacto (Teléfono)</label>
              <input className="form-control" value={contactoTelefono} onChange={e=>setContactoTelefono(e.target.value)} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Contacto (Email)</label>
              <input type="email" className="form-control" value={contactoEmail} onChange={e=>setContactoEmail(e.target.value)} />
            </div>
          </div>

          <div className="d-flex justify-content-between gap-2 mt-3">
            {modo === 'editar' ? (
              <button className="btn btn-outline-danger" onClick={() => setConfirmOpen(true)} disabled={guardando}>
                Cancelar evento
              </button>
            ) : <span />}

            <div className="d-flex gap-2">
              <button className="btn btn-light" onClick={onClose} disabled={guardando}>Cerrar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : (modo === 'editar' ? 'Guardar cambios' : 'Guardar evento')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1060 }}
        >
          <div className="bg-white rounded-3 shadow p-3" style={{ width: 'min(520px, 96vw)' }}>
            <div className="d-flex align-items-start gap-3">
              <div
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: 44, height: 44, background: '#fde2e7' }}
              >
                <i className="bi bi-exclamation-triangle-fill fs-5 text-danger" />
              </div>
              <div className="flex-grow-1">
                <h5 className="mb-1">¿Eliminar este evento?</h5>
                <p className="text-muted mb-3">
                  Se eliminará de la sala y la fecha seleccionadas. Esta acción no se puede deshacer.
                </p>
                <div className="d-flex justify-content-end gap-2">
                  <button className="btn btn-light" onClick={() => setConfirmOpen(false)} disabled={guardando}>
                    Cancelar
                  </button>
                  <button className="btn btn-danger" onClick={confirmarCancelacion} disabled={guardando}>
                    {guardando ? 'Eliminando…' : 'Eliminar'}
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
