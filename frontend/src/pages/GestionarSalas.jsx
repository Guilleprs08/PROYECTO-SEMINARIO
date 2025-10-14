// src/pages/GestionarSalas.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

export default function GestionarSalas() {
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [estado, setEstado] = useState('ACTIVA'); // solo aplica en edición

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [salaToDelete, setSalaToDelete] = useState(null);

  // --- Conservamos el generador NxM por si lo vuelves a usar en el futuro,
  // --- pero ya no mostramos el botón que lo abre.
  const [genOpen, setGenOpen] = useState(false);
  const [genSala, setGenSala] = useState(null);
  const [filas, setFilas] = useState(10);
  const [cols, setCols] = useState(15);
  const [primeraFila, setPrimeraFila] = useState('A');
  const [override, setOverride] = useState(false);

  const titulo = useMemo(() => (editing ? 'Editar sala' : 'Agregar sala'), [editing]);

  const abrirGenerar = (s) => {
    setGenSala(s);
    setFilas(Math.max(1, Number(s.capacidad ? Math.floor(Math.sqrt(Number(s.capacidad))) : 10)));
    setCols(Math.max(1, Number(s.capacidad ? Math.ceil(Number(s.capacidad) / Math.max(1, Math.floor(Math.sqrt(Number(s.capacidad))))) : 15)));
    setPrimeraFila('A');
    setOverride(false);
    setGenOpen(true);
  };
  const cerrarGenerar = () => { setGenOpen(false); setGenSala(null); };

  const generarAsientos = async (e) => {
    e.preventDefault();
    if (!genSala) return;
    try {
      const body = { filas: Number(filas), columnas: Number(cols), primeraFila, override };
      const { data } = await axios.post(`${API_BASE}/api/salas/${genSala.id}/asientos/generar`, body);
      toast.success(`Se generaron ${data?.created ?? 0} asientos`);
      cerrarGenerar();
      await load(); // recarga listado (capacidad)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudieron generar asientos');
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_BASE}/api/salas`);
      setSalas(Array.isArray(data) ? data : []);
    } catch {
      toast.error('No se pudieron cargar las salas');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const abrirCrear = () => {
    setEditing(null);
    setNombre('');
    setCapacidad('');
    setEstado('ACTIVA');
    setModalOpen(true);
  };

  const abrirEditar = (s) => {
    setEditing(s);
    setNombre(s.nombre);
    // capacidad YA NO se edita aquí (solo en editor avanzado)
    setCapacidad(String(s.capacidad || ''));
    setEstado(String(s.estado || 'ACTIVA').toUpperCase());
    setModalOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return toast.warn('Nombre requerido');

    try {
      if (editing) {
        // ← Editar: NO tocamos capacidad
        await axios.put(`${API_BASE}/api/salas/${editing.id}`, { nombre, estado });
        toast.success('Sala actualizada');
      } else {
        // ← Crear: capacidad obligatoria
        if (Number(capacidad) <= 0) return toast.warn('Capacidad debe ser > 0');
        await axios.post(`${API_BASE}/api/salas`, { nombre, capacidad });
        toast.success('Sala creada');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      if (status === 409 && /inactivar/i.test(msg || '')) {
        toast.info(msg || 'No se puede inactivar: la sala tiene funciones activas.');
        setEstado('ACTIVA'); // revertir selección
      } else {
        toast.error(msg || 'Error al guardar');
      }
    }
  };

  const solicitarEliminar = (s) => { setSalaToDelete(s); setConfirmOpen(true); };
  const cancelarEliminar = () => { if (deleting) return; setConfirmOpen(false); setSalaToDelete(null); };

  const confirmarEliminar = async () => {
    if (!salaToDelete) return;
    try {
      setDeleting(true);
      await axios.delete(`${API_BASE}/api/salas/${salaToDelete.id}`);
      toast.success('Sala eliminada');
      cancelarEliminar();
      await load(); // recarga la tabla
    } catch (err) {
      toast.error(err?.response?.data?.message || 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Salas</h2>
        <button className="btn btn-success" onClick={abrirCrear}>
          <i className="fas fa-plus me-2" /> Agregar sala
        </button>
      </div>

      {loading ? (
        <div className="text-muted">Cargando…</div>
      ) : salas.length === 0 ? (
        <div className="text-muted">No hay salas registradas.</div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th style={{width:'45%'}}>Nombre</th>
                <th style={{width:'15%'}}>Capacidad</th>
                <th style={{width:'20%'}}>Estado</th>
                <th style={{width:'20%'}} className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {salas.map(s => (
                <tr key={s.id}>
                  <td>{s.nombre}</td>
                  <td>{s.capacidad}</td>
                  <td>
                    <span className={`badge ${s.estado === 'ACTIVA' ? 'bg-success' : 'bg-warning text-dark'}`}>
                      {s.estado}
                    </span>
                  </td>
                    <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                      <div className="btn-group btn-group-sm" role="group" aria-label="acciones sala">
                        {Number(s.funcionesActivas) > 0 ? (
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="No disponible: la sala tiene funciones ACTIVAS"
                            disabled
                          >
                            <i className="fas fa-th-large me-1" /> Editor avanzado
                          </button>
                        ) : (
                          <Link
                            to={`/dashboard/salas/${s.id}/disenio`}
                            className="btn btn-outline-secondary"
                            title="Editor avanzado"
                          >
                            <i className="fas fa-th-large me-1" /> Editor avanzado
                          </Link>
                        )}

                        <button
                          className="btn btn-outline-primary"
                          onClick={() => abrirEditar(s)}
                          title="Editar sala"
                        >
                          <i className="fas fa-pen" /> Editar
                        </button>

                        <button
                          className="btn btn-outline-danger"
                          onClick={() => solicitarEliminar(s)}
                          title="Eliminar sala"
                        >
                          <i className="fas fa-trash" /> Eliminar
                        </button>
                      </div>
                    </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear/editar */}
      {modalOpen && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={guardar} noValidate>
                  <div className="modal-header">
                    <h5 className="modal-title">{titulo}</h5>
                    <button type="button" className="btn-close" onClick={() => setModalOpen(false)} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Nombre</label>
                      <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} />
                    </div>

                    {/* Capacidad solo al CREAR */}
                    {!editing && (
                      <div className="mb-3">
                        <label className="form-label">Capacidad</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={capacidad}
                          onChange={e => setCapacidad(e.target.value)}
                        />
                        <small className="text-muted">La capacidad se actualizará automáticamente desde el editor avanzado.</small>
                      </div>
                    )}

                    {/* Estado solo al EDITAR */}
                    {editing && (
                      <div className="mb-3">
                        <label className="form-label">Estado</label>
                        <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                          <option value="ACTIVA">ACTIVA</option>
                          <option value="INACTIVA">INACTIVA</option>
                        </select>
                        <small className="text-muted d-block mt-2">
                          Nota: No se puede inactivar si la sala tiene funciones activas. No podrás eliminar la sala si tiene funciones (activas o canceladas).
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary">Guardar</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      {/* Confirmación eliminar */}
      {confirmOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ zIndex: 1090 }}
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !deleting) cancelarEliminar();
            if (e.key === 'Enter' && !deleting) confirmarEliminar();
          }}
        >
          <div className="w-100 h-100 bg-dark bg-opacity-50" onClick={() => !deleting && cancelarEliminar()} />
          <div className="position-absolute top-50 start-50 translate-middle" style={{ minWidth: 380 }}>
            <div className="card shadow-lg rounded-3">
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="rounded-circle bg-danger bg-opacity-10 p-2">
                    <i className="fas fa-exclamation-triangle text-danger"></i>
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="fw-semibold mb-1">¿Eliminar esta sala?</h6>
                    <p className="text-muted small mb-0">
                      Se eliminará la sala “{salaToDelete?.nombre}”. Esta acción no se puede deshacer.
                    </p>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-outline-secondary" onClick={cancelarEliminar} disabled={deleting} autoFocus>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={confirmarEliminar} disabled={deleting}>
                    {deleting ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* (Oculto) Generador NxM — ya no hay botón para abrirlo */}
      {genOpen && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
            <div className="modal-dialog">
              <div className="modal-content">
                <form onSubmit={generarAsientos} noValidate>
                  <div className="modal-header">
                    <h5 className="modal-title">Diseñar asientos — {genSala?.nombre}</h5>
                    <button type="button" className="btn-close" onClick={cerrarGenerar} />
                  </div>
                  <div className="modal-body">
                    <div className="row g-3">
                      <div className="col-6">
                        <label className="form-label">Filas</label>
                        <input type="number" min="1" max="26" className="form-control"
                          value={filas} onChange={e=>setFilas(e.target.value)} />
                        <small className="text-muted">Máx. 26 (A-Z)</small>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Columnas</label>
                        <input type="number" min="1" className="form-control"
                          value={cols} onChange={e=>setCols(e.target.value)} />
                      </div>
                      <div className="col-6">
                        <label className="form-label">Primera fila</label>
                        <input maxLength={1} className="form-control"
                          value={primeraFila} onChange={e=>setPrimeraFila(e.target.value.toUpperCase().slice(0,1))} />
                        <small className="text-muted">Letra A-Z</small>
                      </div>
                      <div className="col-6 d-flex align-items-end">
                        <div className="form-check">
                          <input id="chkOverride" className="form-check-input" type="checkbox"
                            checked={override} onChange={e=>setOverride(e.target.checked)} />
                          <label className="form-check-label" htmlFor="chkOverride">Reemplazar si ya existen</label>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 small text-muted">
                      Se generarán códigos como <b>A-1</b>, <b>A-2</b>, … y se actualizará la <b>capacidad</b> de la sala a <b>{Number(filas) * Number(cols)}</b>.
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={cerrarGenerar}>Cancelar</button>
                    <button type="submit" className="btn btn-primary">Generar</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
    </div>
  );
}
