// src/components/AgregarPelicula.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const absUrl = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${API_BASE}${u}`;
  return `${API_BASE}/${u.replace(/^\//, '')}`;
};

const AgregarPelicula = ({ show, onClose, onGuardado }) => {
  const [titulo, setTitulo] = useState('');
  const [duracion, setDuracion] = useState('');
  const [idiomaId, setIdiomaId] = useState('');
  const [clasificacionId, setClasificacionId] = useState('');
  const [formatoId, setFormatoId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState('');

  const [idiomas, setIdiomas] = useState([]);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [formatos, setFormatos] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const [cargandoCat, setCargandoCat] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!imagenFile) return setImagenPreview('');
    const url = URL.createObjectURL(imagenFile);
    setImagenPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imagenFile]);

  useEffect(() => {
    const cargarCatalogos = async () => {
      setCargandoCat(true);
      try {
        const { data } = await axios.get(`${API_BASE}/api/peliculas/select-data`);
        setIdiomas(Array.isArray(data?.idiomas) ? data.idiomas : []);
        setClasificaciones(Array.isArray(data?.clasificaciones) ? data.clasificaciones : []);
        setFormatos(Array.isArray(data?.formatos) ? data.formatos : []);
        setCategorias(Array.isArray(data?.categorias) ? data.categorias : []);
      } catch (e) {
        console.error(e);
        toast.error('Error al cargar catálogos');
      } finally {
        setCargandoCat(false);
      }
    };
    if (show) cargarCatalogos();
  }, [show]);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return setImagenFile(null);
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!okTypes.includes(f.type)) return toast.warn('Usa JPG, PNG o WEBP');
    if (f.size > 2 * 1024 * 1024) return toast.warn('Imagen máx. 2MB');
    setImagenFile(f);
  };

  const resetForm = () => {
    setTitulo(''); setDuracion('');
    setIdiomaId(''); setClasificacionId(''); setFormatoId(''); setCategoriaId('');
    setImagenFile(null); setImagenPreview('');
  };

  const nombrePorId = (lista, id) =>
    (lista.find(x => String(x?.id) === String(id))?.nombre) || '—';

  const handleSubmit = async (e) => {
    e.preventDefault();

    const t = titulo.trim();
    if (!t) return toast.warn('Ingrese el título');
    if (t.length > 150) return toast.warn('El título no debe superar 150 caracteres');

    const d = Number(duracion);
    if (!d || d <= 0 || d > 600) return toast.warn('Duración inválida (1-600 min)');

    if (!idiomaId) return toast.warn('Seleccione el idioma');
    if (!clasificacionId) return toast.warn('Seleccione la clasificación');
    if (!formatoId) return toast.warn('Seleccione el formato');
    if (!categoriaId) return toast.warn('Seleccione la categoría');
    if (!imagenFile) return toast.warn('Adjunte una imagen');

    try {
      setEnviando(true);
      const fd = new FormData();
      fd.append('titulo', t);
      fd.append('duracionMin', String(d));
      fd.append('id_idioma', String(idiomaId));
      fd.append('id_clasificacion', String(clasificacionId));
      fd.append('id_formato', String(formatoId));
      fd.append('id_categoria', String(categoriaId));
      fd.append('imagen', imagenFile);

      const resp = await axios.post(`${API_BASE}/api/peliculas`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = resp?.data || {};
      const urlRel = (data.imagenUrl || data.IMAGEN_URL || data.imagen_url || '').toString();
      const imagenRemota = absUrl(urlRel.replace(/\\/g, '/'));

      const nuevo = {
        id: data.id || data.ID || Date.now(),
        titulo: t,
        duracionMin: d,
        imagenUrl: imagenRemota || imagenPreview,
        estado: 'ACTIVA',
        idiomaNombre:        nombrePorId(idiomas, idiomaId),
        clasificacionCodigo: nombrePorId(clasificaciones, clasificacionId),
        formatoNombre:       nombrePorId(formatos, formatoId),
        categoriaNombre:     nombrePorId(categorias, categoriaId),
      };

      onGuardado?.(nuevo);
      resetForm();
    } catch (err) {
      console.error('Error al registrar película:', err);
      toast.error(
        err?.response?.data?.message ||
        (err?.request ? 'No se pudo conectar con el servidor' : err?.message) ||
        'No se pudo registrar la película'
      );
    } finally {
      setEnviando(false);
    }
  };

  if (!show) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Agregar nueva película</h5>
              <button type="button" className="btn-close" onClick={() => { resetForm(); onClose?.(); }} aria-label="Close" />
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label">Título</label>
                    <input type="text" className="form-control" placeholder="Ej. La Gran Aventura"
                      value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={150} required />
                    <div className="text-end"><small className="text-muted">{titulo.length}/150</small></div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Duración (min)</label>
                    <div className="input-group">
                      <input type="number" className="form-control" placeholder="Ej. 120"
                        value={duracion} onChange={(e) => setDuracion(e.target.value)} min={1} max={600} required />
                      <span className="input-group-text">min</span>
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Idioma</label>
                    <select className="form-select" value={idiomaId} onChange={(e) => setIdiomaId(e.target.value)} required disabled={cargandoCat}>
                      <option value="">{cargandoCat ? 'Cargando...' : 'Seleccione...'}</option>
                      {idiomas.map((opt) => <option key={opt.id} value={opt.id}>{opt.nombre}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Clasificación</label>
                    <select className="form-select" value={clasificacionId} onChange={(e) => setClasificacionId(e.target.value)} required disabled={cargandoCat}>
                      <option value="">{cargandoCat ? 'Cargando...' : 'Seleccione...'}</option>
                      {clasificaciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Formato</label>
                    <select className="form-select" value={formatoId} onChange={(e) => setFormatoId(e.target.value)} required disabled={cargandoCat}>
                      <option value="">{cargandoCat ? 'Cargando...' : 'Seleccione...'}</option>
                      {formatos.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Categoría</label>
                    <select className="form-select" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required disabled={cargandoCat}>
                      <option value="">{cargandoCat ? 'Cargando...' : 'Seleccione...'}</option>
                      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Imagen (JPG/PNG/WEBP, máx. 2MB)</label>
                    <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} required />
                    {imagenPreview && (
                      <div className="mt-2">
                        <img src={imagenPreview} alt="Previsualización" style={{ maxWidth: '220px', borderRadius: '12px' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => { resetForm(); onClose?.(); }} disabled={enviando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="modal-backdrop fade show" />
    </>
  );
};

export default AgregarPelicula;
