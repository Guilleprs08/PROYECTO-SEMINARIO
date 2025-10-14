import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { validarNombre } from '../utils/validations';

const ModalNuevoRol = ({ onClose, onRolGuardado }) => {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const handleGuardar = async () => {
    const errorValidacion = validarNombre(nombre);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    try {
      await axios.post('http://localhost:3001/api/roles', {
        nombre: nombre.trim()
      });

      toast.success('Rol creado correctamente');
      onRolGuardado(); // Actualiza la lista
      onClose();       // Cierra el modal
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Ya existe un rol con ese nombre.');
        toast.error('Ya existe un rol con ese nombre.');
      } else {
        toast.error('Ocurrió un error al guardar el rol');
      }
    }
  };

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-flex align-items-center justify-content-center z-3">
      <div className="bg-white rounded p-4 shadow" style={{ width: '100%', maxWidth: '500px' }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0 d-flex align-items-center gap-2">
            <Plus size={20} /> Crear Nuevo Rol
          </h5>
          <button className="btn btn-sm btn-light" onClick={onClose}>
            <X />
          </button>
        </div>

        <div>
          <label className="form-label">Nombre del Rol</label>
          <input
            type="text"
            className={`form-control ${error ? 'is-invalid' : ''}`}
            placeholder="Ej: Supervisor"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(''); // Limpia al escribir
            }}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>

        <div className="d-flex justify-content-end gap-2 mt-3">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar}>Guardar</button>
        </div>
      </div>
    </div>
  );
};

export default ModalNuevoRol;
