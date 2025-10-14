// src/components/EditarPelicula.jsx
// Incluye manejo del error 409 para impedir inactivar con funciones activas
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const absUrl = (u) => {
  if (!u) return '';
  const clean = String(u).replace(/\\/g, '/');
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${API_BASE}${clean}`;
  return `${API_BASE}/${clean.replace(/^\//, '')}`;
};

export default function EditarPelicula({ show, onClose, pelicula, onActualizado }) {
  const [titulo, setTitulo] = useState('');
  const [duracionMin, setDuracionMin] = useState('');

  // catálogos
  const [idiomas, setIdiomas] = useState([]);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [formatos, setFormatos] = useState([]);
  const [categorias, setCategorias] = useState([]);

  // ids seleccionados
  const [id_idioma, setIdIdioma] = useState('');
  const [id_clasificacion, setIdClasificacion] = useState('');
  const [id_formato, setIdFormato] = useState('');
  const [id_categoria, setIdCategoria] = useState('');

  // estado ACTIVA/INACTIVA
  const [estado, setEstado] = useState('ACTIVA');

  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState('');

  // cargar catálogos cuando se abre
  useEffect(() => {
    if (!show) return;
    (async () => {
      const { data } = await axios.get(`${API_BASE}/api/peliculas/select-data`);
      setIdiomas(data?.idiomas || []);
      setClasificaciones(data?.clasificaciones || []);
      setFormatos(data?.formatos || []);
      setCategorias(data?.categorias || []);
    })().catch(console.error);
  }, [show]);

  // precargar valores de la película
  useEffect(() => {
    if (!pelicula) return;
    setTitulo(pelicula.titulo || '');
    setDuracionMin(pelicula.duracionMin ?? '');
    setIdIdioma(pelicula.id_idioma ?? '');
    setIdClasificacion(pelicula.id_clasificacion ?? '');
    setIdFormato(pelicula.id_formato ?? '');
    setIdCategoria(pelicula.id_categoria ?? '');
    setEstado((pelicula.estado || 'ACTIVA').toUpperCase());
    setImagenPreview(absUrl(pelicula.imagenUrl || ''));
    setImagenFile(null);
  }, [pelicula]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    setImagenFile(f || null);
    if (f) setImagenPreview(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('titulo', titulo);
      fd.append('duracionMin', duracionMin);
      fd.append('id_idioma', id_idioma);
      fd.append('id_clasificacion', id_clasificacion);
      fd.append('id_formato', id_formato);
      fd.append('id_categoria', id_categoria);
      fd.append('estado', estado);
      if (imagenFile) fd.append('imagen', imagenFile);

      const { data } = await axios.put(`${API_BASE}/api/peliculas/${pelicula.id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const getName = (arr, id) => (arr.find(x => String(x.id) === String(id))?.nombre || '');

      const actualizado = {
        id: data.id ?? pelicula.id,
        titulo: data.titulo ?? titulo,
        duracionMin: data.duracionMin ?? Number(duracionMin),
        imagenUrl: absUrl(data.imagenUrl || pelicula.imagenUrl),
        estado: data.estado ?? estado,
        idiomaNombre: data.idiomaNombre ?? getName(idiomas, id_idioma),
        clasificacionCodigo: data.clasificacionCodigo ?? getName(clasificaciones, id_clasificacion),
        formatoNombre: data.formatoNombre ?? getName(formatos, id_formato),
        categoriaNombre: data.categoriaNombre ?? getName(categorias, id_categoria),
      };

      onActualizado(actualizado);
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      if (status === 409) {
        // intento de inactivar con funciones activas
        toast.info(msg || 'No se puede inactivar: la película tiene funciones activas.');
        setEstado('ACTIVA'); // revertir select
        return;
      }
      console.error(err);
      toast.error('No se pudo actualizar la película');
    }
  };

  if (!show) return null;

  return (
    <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,.4)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <form onSubmit={submit}>
            <div className="modal-header">
              <h5 className="modal-title">Editar película</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label">Título</label>
                  <input className="form-control" value={titulo} onChange={e => setTitulo(e.target.value)} required />
                </div>

                <div className="col-md-2">
                  <label className="form-label">Duración (min)</label>
                  <input type="number" className="form-control" value={duracionMin} onChange={e => setDuracionMin(e.target.value)} required min={1} max={600} />
                </div>

                <div className="col-md-2">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="ACTIVA">ACTIVA</option>
                    <option value="INACTIVA">INACTIVA</option>
                  </select>
                </div>

                {/* Idioma */}
                <div className="col-md-4">
                  <label className="form-label">Idioma</label>
                  <select className="form-select" value={id_idioma} onChange={e => setIdIdioma(e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {idiomas.map(i => (
                      <option key={i.id} value={i.id}>{i.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Clasificación */}
                <div className="col-md-4">
                  <label className="form-label">Clasificación</label>
                  <select className="form-select" value={id_clasificacion} onChange={e => setIdClasificacion(e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {clasificaciones.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Formato */}
                <div className="col-md-4">
                  <label className="form-label">Formato</label>
                  <select className="form-select" value={id_formato} onChange={e => setIdFormato(e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {formatos.map(f => (
                      <option key={f.id} value={f.id}>{f.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Categoría */}
                <div className="col-md-6">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={id_categoria} onChange={e => setIdCategoria(e.target.value)} required>
                    <option value="">Seleccione…</option>
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Imagen */}
                <div className="col-md-12">
                  <label className="form-label">Imagen (opcional)</label>
                  <input type="file" className="form-control" accept="image/*" onChange={handleFile} />
                  {(imagenPreview || pelicula.imagenUrl) && (
                    <img
                      src={imagenPreview || absUrl(pelicula.imagenUrl)}
                      alt="preview"
                      className="mt-2 rounded"
                      style={{ height: 140, objectFit: 'cover' }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar cambios</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
