import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { validarNombre, validarUsuario, validarContrasena } from '../utils/validations';

const NuevoUsuarioModal = ({
  show,
  onClose,
  onUsuarioCreado,
  modoEdicion = false,
  usuarioEditar = null,
  idAdmin = null
}) => {
  const [formData, setFormData] = useState({
    nombre: '',
    correo: '',
    usuario: '',
    contrasena: '',
    estado: '',
    rol: '',
  });

  const [errors, setErrors] = useState({});
  const [estados, setEstados] = useState([]);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (show) {
      axios.get('http://localhost:3001/api/estados').then(res => setEstados(res.data));
      axios.get('http://localhost:3001/api/roles').then(res => setRoles(res.data));

      if (modoEdicion && usuarioEditar) {
        setFormData({
          nombre: usuarioEditar.NOMBRE || '',
          correo: usuarioEditar.CORREO || '',
          usuario: usuarioEditar.USUARIO || '',
          contrasena: '',
          estado: usuarioEditar.ESTADO || '',
          rol: usuarioEditar.ROL_ID || '',
        });
      } else {
        setFormData({
          nombre: '',
          correo: '',
          usuario: '',
          contrasena: '',
          estado: '',
          rol: '',
        });
      }

      setErrors({});
    }
  }, [show, modoEdicion, usuarioEditar]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validarFormulario = () => {
    const nuevosErrores = {};

    const errorNombre = validarNombre(formData.nombre);
    if (errorNombre) nuevosErrores.nombre = errorNombre;

    const errorUsuario = validarUsuario(formData.usuario);
    if (errorUsuario) nuevosErrores.usuario = errorUsuario;

    if (!modoEdicion) {
      const errorContrasena = validarContrasena(formData.contrasena);
      if (errorContrasena) nuevosErrores.contrasena = errorContrasena;
    }

    if (!formData.correo) {
      nuevosErrores.correo = 'El correo es obligatorio';
    } else {
      const regexEmail = /^\S+@\S+\.\S+$/;
      if (!regexEmail.test(formData.correo)) {
        nuevosErrores.correo = 'Correo inválido';
      }
    }

    if (!formData.estado) {
      nuevosErrores.estado = 'Seleccione un estado';
    }

    if (!formData.rol) {
      nuevosErrores.rol = 'Seleccione un rol';
    }

    setErrors(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validarFormulario()) return;

    if (!idAdmin) {
      toast.error('No se pudo identificar al administrador que realiza la acción.');
      return;
    }

    try {
      if (modoEdicion) {
        const datosEnviar = {
          ...formData,
          id_admin: idAdmin
        };

        await axios.put(`http://localhost:3001/api/usuarios/${usuarioEditar.ID}`, datosEnviar);
        toast.success('Usuario editado correctamente');
      } else {
        const datosEnviar = {
          ...formData,
          id_admin: idAdmin
        };

        await axios.post('http://localhost:3001/api/usuarios', datosEnviar);
        toast.success('Usuario creado correctamente');
      }

      onUsuarioCreado();
      onClose();
    } catch (error) {
      console.error('Error al guardar usuario:', error);
      toast.error('Error al guardar usuario. Intente nuevamente.');
    }
  };

  if (!show) return null;

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog" role="document">
        <div className="modal-content">
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-header">
              <h5 className="modal-title">
                {modoEdicion ? 'Editar Usuario' : 'Agregar Nuevo Usuario'}
              </h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <label className="form-label" htmlFor="nombre">Nombre</label>
                <input
                  type="text"
                  id="nombre"
                  name="nombre"
                  className={`form-control ${errors.nombre ? 'is-invalid' : ''}`}
                  value={formData.nombre}
                  onChange={handleChange}
                />
                {errors.nombre && <div className="invalid-feedback">{errors.nombre}</div>}
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="correo">Correo</label>
                <input
                  type="email"
                  id="correo"
                  name="correo"
                  disabled={modoEdicion}
                  className={`form-control ${errors.correo ? 'is-invalid' : ''}`}
                  value={formData.correo}
                  onChange={handleChange}
                />
                {errors.correo && <div className="invalid-feedback">{errors.correo}</div>}
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="usuario">Usuario</label>
                <input
                  type="text"
                  id="usuario"
                  name="usuario"
                  className={`form-control ${errors.usuario ? 'is-invalid' : ''}`}
                  value={formData.usuario}
                  onChange={handleChange}
                />
                {errors.usuario && <div className="invalid-feedback">{errors.usuario}</div>}
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="contrasena">Contraseña</label>
                <input
                  type="password"
                  id="contrasena"
                  name="contrasena"
                  disabled={modoEdicion}
                  className={`form-control ${errors.contrasena ? 'is-invalid' : ''}`}
                  value={formData.contrasena}
                  onChange={handleChange}
                />
                {errors.contrasena && <div className="invalid-feedback">{errors.contrasena}</div>}
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="estado">Estado</label>
                <select
                  id="estado"
                  name="estado"
                  className={`form-select ${errors.estado ? 'is-invalid' : ''}`}
                  value={formData.estado}
                  onChange={handleChange}
                >
                  <option value="">Seleccione estado</option>
                  {estados.map(e => (
                    <option key={e.ID} value={e.ID}>{e.NOMBRE}</option>
                  ))}
                </select>
                {errors.estado && <div className="invalid-feedback">{errors.estado}</div>}
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="rol">Rol</label>
                <select
                  id="rol"
                  name="rol"
                  className={`form-select ${errors.rol ? 'is-invalid' : ''}`}
                  value={formData.rol}
                  onChange={handleChange}
                >
                  <option value="">Seleccione rol</option>
                  {roles.map(r => (
                    <option key={r.ID} value={r.ID}>{r.NOMBRE}</option>
                  ))}
                </select>
                {errors.rol && <div className="invalid-feedback">{errors.rol}</div>}
              </div>
            </div>

            <div className="modal-footer">
              <button type="submit" className="btn btn-primary">
                {modoEdicion ? 'Guardar Cambios' : 'Guardar'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NuevoUsuarioModal;
