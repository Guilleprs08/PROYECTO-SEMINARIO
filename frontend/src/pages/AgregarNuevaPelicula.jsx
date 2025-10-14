// src/pages/Peliculas.jsx
import 'bootstrap-icons/font/bootstrap-icons.css';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import AgregarPelicula from '../components/AgregarPelicula';
import EditarPelicula from '../components/EditarPelicula';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

// Convierte "/uploads/xxx.jpg" -> "http://localhost:3001/uploads/xxx.jpg"
const absUrl = (u) => {
  if (!u) return '';
  const clean = String(u).replace(/\\/g, '/');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${API_BASE}${clean}`;
  return `${API_BASE}/${clean.replace(/^\//, '')}`;
};

const Peliculas = () => {
  const [showModal, setShowModal] = useState(false);
  const [peliculas, setPeliculas] = useState([]);
  const [cargando, setCargando] = useState(true);

  // confirm eliminar
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [peliculaAEliminar, setPeliculaAEliminar] = useState(null);
  const [checking, setChecking] = useState(false);

  // Buscador y filtro
  const [q, setQ] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [categorias, setCategorias] = useState([]);

  // Edición
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);

  // Cargar categorías
  useEffect(() => {
    const loadCats = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/peliculas/select-data`);
        const cats = (data?.categorias || data?.CATEGORIAS || []).map(c => ({
          id: c.ID_CATEGORIA ?? c.id_categoria ?? c.id,
          nombre: c.NOMBRE ?? c.nombre,
        }));
        setCategorias(cats);
      } catch (e) {
        console.error(e);
        toast.error('No se pudieron cargar las categorías');
      }
    };
    loadCats();
  }, []);

  // Cargar películas (búsqueda en vivo)
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (categoriaId) params.set('categoriaId', categoriaId);
        const url = `${API_BASE}/api/peliculas${params.toString() ? `?${params}` : ''}`;
        const { data } = await axios.get(url, { signal: controller.signal });
        setPeliculas(Array.isArray(data) ? data : []);
      } catch (err) {
        if (axios.isCancel?.(err)) return;
        console.error(err);
        toast.error('No se pudieron cargar las películas');
      } finally {
        setCargando(false);
      }
    }, 200);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, categoriaId]);

  // Al guardar desde "Agregar"
  const onGuardado = (nuevo) => {
    const item = {
      ...nuevo,
      imagenUrl: absUrl(nuevo.imagenUrl || nuevo.posterUrl || nuevo.posterLocal),
      estado: nuevo.estado || 'ACTIVA'
    };

    // Respetar filtros activos
    const matchQ = !q.trim() || (item.titulo || '').toLowerCase().includes(q.trim().toLowerCase());
    const selectedCatName = categorias.find(c => String(c.id) === String(categoriaId))?.nombre || null;
    const matchCat = !categoriaId || (item.categoriaNombre && item.categoriaNombre === selectedCatName);

    if (matchQ && matchCat) setPeliculas(prev => [item, ...prev]);
    toast.success('Película registrada');
    setShowModal(false);
  };

  // Pre-validar y abrir confirmación de eliminar
  const abrirEliminar = async (p) => {
    setChecking(true);
    try {
      const urlCount = `${API_BASE}/api/funciones/count?peliculaId=${p.id}`;
      const { data } = await axios.get(urlCount);
      const count = Number(data?.count ?? data?.COUNT ?? 0);
      if (count > 0) {
        toast.info(`No se puede eliminar "${p.titulo}": tiene ${count} función(es) activas.`);
        return;
      }
    } catch {
      // si no existe el endpoint, el backend validará
    } finally {
      setChecking(false);
    }
    setPeliculaAEliminar(p);
    setConfirmOpen(true);
  };

  // Ejecutar eliminación
  const eliminarPelicula = async () => {
    if (!peliculaAEliminar?.id) return;
    try {
      setDeleting(true);
      await axios.delete(`${API_BASE}/api/peliculas/${peliculaAEliminar.id}`);
      setPeliculas(prev => prev.filter(x => String(x.id) !== String(peliculaAEliminar.id)));
      toast.success('Película eliminada');
    } catch (e) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message;
      if (status === 409 || /funcion(es)?/i.test(msg || '')) {
        toast.error(msg || 'No se puede eliminar: la película tiene funciones asignadas.');
      } else {
        toast.error('No se pudo eliminar la película');
      }
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setPeliculaAEliminar(null);
    }
  };

  // Abrir edición
  const abrirEdicion = async (p) => {
    try {
      const { data } = await axios.get(`${API_BASE}/api/peliculas/${p.id}`);
      setEditData(data);
      setEditOpen(true);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo cargar la película para editar');
    }
  };

  // Recibir cambios desde el modal de edición
  const onActualizado = (upd) => {
    setPeliculas(prev => prev.map(x => (String(x.id) === String(upd.id) ? { ...x, ...upd } : x)));
    setEditOpen(false);
    setEditData(null);
    toast.success('Película actualizada');
  };

  return (
    <div className="container py-4">
      {/* Toolbar */}
      <div className="d-flex align-items-start justify-content-between gap-3 mb-4 flex-wrap">
        <h3 className="mb-0">Películas</h3>

        {/* Buscador */}
        <div className="input-group input-group-lg flex-grow-1" style={{ minWidth: 360, maxWidth: 640 }}>
          <span className="input-group-text bg-white">
            <i className="bi bi-search" />
          </span>
          <input
            className="form-control border-start-0 ps-0"
            placeholder="Buscar por título…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar por título"
          />
          {q && (
            <button className="btn btn-outline-secondary" type="button" title="Limpiar" onClick={() => setQ('')}>
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>

        {/* Botón agregar y filtro categoría */}
        <div className="d-flex flex-column gap-2" style={{ minWidth: 220 }}>
          <button className="btn btn-primary btn-lg" style={{ whiteSpace: 'nowrap' }} onClick={() => setShowModal(true)}>
            Agregar nueva película
          </button>

          <div className="input-group input-group-lg" style={{ width: 220 }}>
            <span className="input-group-text bg-white">
              <i className="bi bi-tags" />
            </span>
            <select
              className="form-select border-start-0 ps-0"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {categoriaId && (
              <button className="btn btn-outline-secondary" type="button" title="Quitar filtro" onClick={() => setCategoriaId('')}>
                <i className="bi bi-x-lg" />
              </button>
            )}
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="text-muted">Cargando películas…</div>
      ) : peliculas.length === 0 ? (
        <div className="text-muted">No hay películas registradas.</div>
      ) : (
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
          {peliculas.map((p) => (
            <div className="col" key={p.id}>
              <div className="card h-100 shadow-sm border-0 position-relative">
                {/* Botones */}
                <div className="position-absolute bottom-0 end-0 p-2">
                  <div className="btn-group">
                    <button className="btn btn-light btn-sm border" title="Editar película" onClick={() => abrirEdicion(p)}>
                      <i className="bi bi-pencil-square" />
                    </button>
                    <button
                      className="btn btn-light btn-sm border"
                      title={checking ? 'Validando…' : 'Eliminar película'}
                      disabled={checking}
                      onClick={() => abrirEliminar(p)}
                    >
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                </div>

                {(p.imagenUrl || p.posterUrl || p.posterLocal) && (
                  <img
                    src={absUrl(p.imagenUrl || p.posterUrl || p.posterLocal)}
                    alt={p.titulo}
                    className="card-img-top"
                    style={{ objectFit: 'cover', height: 220 }}
                  />
                )}

                <div className="card-body pb-5">
                  <div className="d-flex align-items-center justify-content-between">
                    <h5 className="card-title mb-2" title={p.titulo}>{p.titulo}</h5>
                    {p.estado && (
                      <span className={`badge ${p.estado === 'ACTIVA' ? 'bg-success' : 'bg-warning text-dark'}`}>
                        {p.estado}
                      </span>
                    )}
                  </div>

                  <div className="mb-2 d-flex flex-wrap gap-2">
                    {p.formatoNombre && <span className="badge bg-secondary">{p.formatoNombre}</span>}
                    {p.idiomaNombre && <span className="badge bg-info text-dark">{p.idiomaNombre}</span>}
                    {p.clasificacionCodigo && <span className="badge bg-dark">{p.clasificacionCodigo}</span>}
                  </div>

                  {p.duracionMin != null && <div className="text-muted mb-1">{p.duracionMin} min</div>}
                  {p.categoriaNombre && <div className="text-muted mb-1">{p.categoriaNombre}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AgregarPelicula show={showModal} onClose={() => setShowModal(false)} onGuardado={onGuardado} />
      )}

      {editOpen && editData && (
        <EditarPelicula
          show={editOpen}
          onClose={() => { setEditOpen(false); setEditData(null); }}
          pelicula={editData}
          onActualizado={onActualizado}
        />
      )}

      {/* Confirm de eliminación */}
      {confirmOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1090 }} role="dialog" aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !deleting) setConfirmOpen(false);
            if (e.key === 'Enter' && !deleting) eliminarPelicula();
          }}>
          <div className="w-100 h-100 bg-dark bg-opacity-50" onClick={() => !deleting && setConfirmOpen(false)} />
          <div className="position-absolute top-50 start-50 translate-middle" style={{ minWidth: 380 }}>
            <div className="card shadow-lg rounded-3">
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="rounded-circle bg-danger bg-opacity-10 p-2">
                    <i className="bi bi-exclamation-triangle-fill text-danger" />
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="fw-semibold mb-1">¿Eliminar esta película?</h6>
                    <p className="text-muted small mb-1">Vas a eliminar: <strong>{peliculaAEliminar?.titulo}</strong>.</p>
                    <p className="text-muted small mb-0">Esta acción no se puede deshacer.</p>
                  </div>
                </div>

                <div className="d-flex justify-content-end gap-2 mt-4">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirmOpen(false)} disabled={deleting} autoFocus>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={eliminarPelicula} disabled={deleting}>
                    {deleting ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}  
    </div>
  );
};

export default Peliculas;
