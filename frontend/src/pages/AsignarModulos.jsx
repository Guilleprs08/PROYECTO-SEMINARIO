import React, { useState, useEffect } from 'react';
import {
  Users, Plus, Settings, Check, X, Eye, Save
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import '../styles/asignar-modulos.css';
import ModalNuevoRol from '../components/Asignacion-Modulos';

const AsignarModulos = () => {
  const [selectedRole, setSelectedRole] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [checkboxStates, setCheckboxStates] = useState({});
  const [roles, setRoles] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [conteoPermisos, setConteoPermisos] = useState([]);

  const formatearNombre = (texto) => {
    return texto.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const cargarRoles = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/roles');
      setRoles(response.data);
    } catch (error) {
      console.error('Error al cargar los roles:', error);
    }
  };

  const cargarModulosYSubmodulos = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/asignacion-modulos');
      setModulos(response.data);
    } catch (error) {
      console.error('Error al cargar los módulos:', error);
    }
  };

  const cargarConteoPermisos = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/permisos-por-rol');
      setConteoPermisos(response.data);
    } catch (error) {
      console.error('Error al cargar el conteo de permisos:', error);
    }
  };

  const cargarPermisosPorRol = async (rolId) => {
    try {
      const response = await axios.get(`http://localhost:3001/api/permisos-por-rol/${rolId}`);
      const permisosAsignados = response.data;

      const nuevosEstados = {};
      permisosAsignados.forEach(permiso => {
        const key = `${permiso.MODULO_ID}-${permiso.SUBMODULO_ID}`;
        nuevosEstados[key] = true;
      });

      setCheckboxStates(nuevosEstados);
    } catch (error) {
      console.error('Error al cargar permisos del rol:', error);
      toast.error('Error al cargar permisos del rol.');
    }
  };

  useEffect(() => {
    cargarRoles();
    cargarModulosYSubmodulos();
    cargarConteoPermisos();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      cargarPermisosPorRol(selectedRole);
    }
  }, [selectedRole]);

  const getConteoPorRol = (rolId) => {
    const encontrado = conteoPermisos.find(item => item.rol_id === rolId);
    return encontrado ? encontrado.total : 0;
  };

  const filteredRoles = roles.filter((rol) =>
    rol.NOMBRE.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAll = () => {
    const updated = {};
    modulos.forEach(modulo => {
      modulo.SUBMODULOS?.forEach(sub => {
        updated[`${modulo.ID}-${sub.ID}`] = true;
      });
    });
    setCheckboxStates(updated);
  };

  const handleDeselectAll = () => {
    const updated = {};
    modulos.forEach(modulo => {
      modulo.SUBMODULOS?.forEach(sub => {
        updated[`${modulo.ID}-${sub.ID}`] = false;
      });
    });
    setCheckboxStates(updated);
  };

  const toggleCheckbox = (key) => {
    setCheckboxStates(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleGuardarPermisos = async () => {
    if (!selectedRole) {
      toast.warning('Seleccione un rol antes de guardar.');
      return;
    }

    const permisosSeleccionados = Object.entries(checkboxStates)
      .filter(([key, valor]) => valor)
      .map(([key]) => {
        const [modulo_id, submodulo_id] = key.split('-').map(Number);
        return { modulo_id, submodulo_id };
      });

    if (permisosSeleccionados.length === 0) {
      toast.warning('Debe seleccionar al menos un submódulo.');
      return;
    }

    try {
      const response = await axios.post('http://localhost:3001/api/permisos', {
        rolId: selectedRole,
        permisos: permisosSeleccionados
      });

      const message = response.data.message || '';

      if (message.toLowerCase().includes('actualizados correctamente')) {
        toast.success('Permisos guardados correctamente.');
      }

      if (message.toLowerCase().includes('administrador')) {
        toast.info('El rol administrador no puede perder submódulos.');
      }

      cargarConteoPermisos();

    } catch (error) {
      if (error.response && error.response.status === 403) {
        const msg = error.response.data.message || 'Operación no permitida.';
        if (msg.toLowerCase().includes('administrador')) {
          toast.error('❌ No se pueden eliminar submódulos del rol administrador.');
          await cargarPermisosPorRol(selectedRole); // 🔁 Restaurar los permisos actuales
          return;
        }
      }

      console.error('Error al guardar permisos:', error);
      toast.error('Error al guardar permisos.');
    }
  };

  return (
    <div className="container-fluid mt-4">
      <div className="row">
        {/* Panel Izquierdo */}
        <div className="col-md-4">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white d-flex align-items-center">
              <Users size={20} className="me-2" />
              <strong>Roles del Sistema</strong>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-end mb-3">
                <button className="btn btn-outline-primary btn-sm" onClick={() => setShowModal(true)}>
                  <Plus size={16} className="me-1" /> Nuevo Rol
                </button>
              </div>

              <input
                type="text"
                className="form-control mb-3"
                placeholder="Buscar roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {filteredRoles.map((rol) => (
                <div
                  key={rol.ID}
                  className={`card mb-2 shadow-sm ${selectedRole === rol.ID ? 'border-primary border-2' : ''}`}
                  onClick={() => setSelectedRole(rol.ID)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="card-body p-2 d-flex justify-content-between align-items-center">
                    <div>
                      <h6 className="mb-0">{rol.NOMBRE}</h6>
                      <small className="text-muted">Rol del sistema</small>
                    </div>
                    <span className="badge bg-info">{getConteoPorRol(rol.ID)} módulos</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel Derecho */}
        <div className="col-md-8">
          <div className="card shadow-sm">
            <div className="card-header bg-secondary text-white d-flex align-items-center">
              <Settings size={20} className="me-2" />
              <strong>Asignación de Módulos</strong>
            </div>

            <div className="card-body">
              {selectedRole ? (
                <>
                  <div className="mb-3">
                    <button className="btn btn-success btn-sm me-2" onClick={handleSelectAll}>
                      <Check size={16} className="me-1" />
                      Seleccionar Todo
                    </button>
                    <button className="btn btn-danger btn-sm me-2" onClick={handleDeselectAll}>
                      <X size={16} className="me-1" />
                      Deseleccionar Todo
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleGuardarPermisos}>
                      <Save size={16} className="me-1" />
                      Guardar Permisos
                    </button>
                  </div>

                  {modulos.length > 0 ? (
                    modulos.map(modulo => (
                      <div key={modulo.ID} className="mb-3">
                        <div className="bg-light p-2 rounded border mb-1">
                          <strong>{formatearNombre(modulo.NOMBRE)}</strong>
                        </div>
                        <div className="ms-3">
                          {modulo.SUBMODULOS?.map(sub => {
                            const key = `${modulo.ID}-${sub.ID}`;
                            return (
                              <div key={sub.ID} className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={key}
                                  checked={checkboxStates[key] || false}
                                  onChange={() => toggleCheckbox(key)}
                                />
                                <label className="form-check-label" htmlFor={key}>
                                  {formatearNombre(sub.NOMBRE)}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted">No hay módulos disponibles.</p>
                  )}
                </>
              ) : (
                <div className="text-center text-muted py-5">
                  <Eye size={40} className="mb-3 text-secondary" />
                  <p>Selecciona un rol para asignar sus permisos.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <ModalNuevoRol
          onClose={() => setShowModal(false)}
          onRolGuardado={() => {
            cargarRoles();
            cargarConteoPermisos();
          }}
        />
      )}
    </div>
  );
};

export default AsignarModulos;
