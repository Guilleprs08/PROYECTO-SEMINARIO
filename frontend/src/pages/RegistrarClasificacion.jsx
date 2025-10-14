import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const RegistrarClasificacion = () => {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [clasificaciones, setClasificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargarClasificaciones = async () => {
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE}/api/clasificaciones`);
      setClasificaciones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar clasificaciones:', err);
      toast.error(
        err?.response?.data?.message ||
          (err?.request
            ? 'No se pudo conectar con el servidor'
            : err?.message) ||
          'No se pudieron cargar las clasificaciones'
      );
    } finally {
      setCargando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const valorNombre = nombre.trim();
    const valorDescripcion = descripcion.trim();

    if (!valorNombre) return toast.warn('Ingrese un nombre de clasificación');
    if (valorNombre.length > 50) return toast.warn('El nombre no debe superar 50 caracteres');
    if (!valorDescripcion) return toast.warn('Ingrese una descripción para la clasificación');
    if (valorDescripcion.length > 500) return toast.warn('La descripción no debe superar 500 caracteres');

    try {
      setEnviando(true);
      await axios.post(`${API_BASE}/api/clasificaciones`, {
        nombre: valorNombre,
        descripcion: valorDescripcion
      });
      toast.success('Clasificación registrada correctamente');
      setNombre('');
      setDescripcion('');
      await cargarClasificaciones();
    } catch (err) {
      console.error('Error al guardar clasificación:', err);
      toast.error(
        err?.response?.data?.message ||
          (err?.request
            ? 'No se pudo conectar con el servidor'
            : err?.message) ||
          'No se pudo registrar la clasificación'
      );
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    cargarClasificaciones();
  }, []);

  return (
    <div className="container">
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <h2 className="h5 mb-3">Registrar Clasificación</h2>

          <form onSubmit={handleSubmit} className="row g-2 mb-4" autoComplete="off" noValidate>
            <div className="col-12 col-md-8">
              <input
                type="text"
                className="form-control"
                placeholder="Nombre de la clasificación"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={50}
                required
              />
              <div className="text-end">
                <small className="text-muted">{nombre.length}/50</small>
              </div>
            </div>
            <div className="col-12 col-md-4 d-grid">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={enviando}
              >
                {enviando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>

            <div className="col-12">
              <textarea
                className="form-control"
                placeholder="Descripción de la clasificación"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={500}
                rows={4}
                style={{ resize: 'none' }}
                required
              />
              <div className="d-flex justify-content-between mt-1">
                <small className="text-muted">Máximo 500 caracteres</small>
                <small className="text-muted">{descripcion.length}/500</small>
              </div>
            </div>
          </form>

          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 120 }}>ID</th>
                  <th style={{ width: 260 }}>Nombre</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={3}>Cargando clasificaciones...</td>
                  </tr>
                ) : clasificaciones.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Sin clasificaciones registradas</td>
                  </tr>
                ) : (
                  clasificaciones.map((cl, i) => {
                    const idVal = cl?.ID ?? cl?.id ?? i;
                    const nombreVal = cl?.NOMBRE ?? cl?.nombre ?? '—';
                    const descVal = cl?.DESCRIPCION ?? cl?.descripcion ?? '—';
                    return (
                      <tr key={idVal}>
                        <td>{idVal}</td>
                        <td>{nombreVal}</td>
                        <td
                          title={typeof descVal === 'string' ? descVal : ''}
                          style={{
                            maxWidth: 420,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {descVal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrarClasificacion;
