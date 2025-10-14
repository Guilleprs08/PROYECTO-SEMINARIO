import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const RegistrarCategoria = () => {
  const [nombre, setNombre] = useState('');
  const [sinopsis, setSinopsis] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargarCategorias = async () => {
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE}/api/categorias`); // ⬅ sin withCredentials
      setCategorias(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar categorías:', err);
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudieron cargar las categorías';
      toast.error(msg);
    } finally {
      setCargando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valorNombre = (nombre || '').trim();
    const valorSinopsis = (sinopsis || '').trim();

    if (!valorNombre) return toast.warn('Ingrese un nombre de categoría');
    if (valorNombre.length > 80) return toast.warn('El nombre no debe superar 80 caracteres');
    if (!valorSinopsis) return toast.warn('Ingrese una sinopsis para la categoría');
    if (valorSinopsis.length > 500) return toast.warn('La sinopsis no debe superar 500 caracteres');

    try {
      setEnviando(true);
      await axios.post(
        `${API_BASE}/api/categorias`,
        { nombre: valorNombre, sinopsis: valorSinopsis } // ⬅ sin withCredentials
      );
      toast.success('Categoría registrada correctamente');
      setNombre('');
      setSinopsis('');
      await cargarCategorias();
    } catch (err) {
      console.error('Error al guardar categoría:', err);
      const msg =
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudo registrar la categoría';
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    cargarCategorias();
  }, []);

  return (
    <div className="container">
      <div className="card shadow-sm border-0">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h2 className="h5 m-0">Registrar Categoría</h2>
          </div>

          <form onSubmit={handleSubmit} className="row g-2 mb-4" autoComplete="off" noValidate>
            <div className="col-12 col-md-8">
              <input
                type="text"
                className="form-control"
                placeholder="Nombre de la categoría"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div className="col-12 col-md-4 d-grid">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={enviando}
                aria-busy={enviando}
              >
                {enviando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>

            {/* Campo de sinopsis */}
            <div className="col-12">
              <textarea
                className="form-control"
                placeholder="Sinopsis de la categoría"
                value={sinopsis}
                onChange={(e) => setSinopsis(e.target.value)}
                maxLength={500}
                rows={4}
                style={{ resize: 'none' }}
                required
              />
              <div className="d-flex justify-content-between mt-1">
                <small className="text-muted">Máximo 500 caracteres</small>
                <small className="text-muted">{sinopsis.length}/500</small>
              </div>
            </div>
          </form>

          <div className="table-responsive">
            <table className="table table-sm align-middle">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 120 }}>ID</th>
                  <th style={{ width: 260 }}>Nombre</th>
                  <th>Sinopsis</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={3}>Cargando categorías...</td>
                  </tr>
                ) : categorias.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Sin categorías registradas</td>
                  </tr>
                ) : (
                  categorias.map((cat, i) => {
                    const idVal = cat?.ID ?? cat?.id ?? i;
                    const nombreVal = cat?.NOMBRE ?? cat?.nombre ?? '—';
                    const sinVal = cat?.SINOPSIS ?? cat?.sinopsis ?? '—';
                    return (
                      <tr key={idVal}>
                        <td>{idVal}</td>
                        <td>{nombreVal}</td>
                        <td
                          title={typeof sinVal === 'string' ? sinVal : ''}
                          style={{
                            maxWidth: 420,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {sinVal}
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

export default RegistrarCategoria;
