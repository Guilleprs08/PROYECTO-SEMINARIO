import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; 
import { FaEdit, FaChevronDown } from 'react-icons/fa';
import NuevoUsuarioModal from '../components/NuevoUsuarioModal';

const RegistrarUsuario = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [estadosFiltro, setEstadosFiltro] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioEditar, setUsuarioEditar] = useState(null);
  const [adminId, setAdminId] = useState(() => {
    const data = localStorage.getItem('adminId');
    return data ? parseInt(data) : null;
  });

  const [paginaActual, setPaginaActual] = useState(1);
  const usuariosPorPagina = 8;

  useEffect(() => {
    cargarUsuarios();
    cargarEstadosFiltro();
  }, []);

  const cargarUsuarios = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/usuarios');
      setUsuarios(response.data);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  };

  const cargarEstadosFiltro = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/estados');
      const nombres = response.data.map(e => e.NOMBRE);
      setEstadosFiltro(['Todos', ...nombres]);
    } catch (error) {
      console.error('Error al cargar los estados del filtro:', error);
    }
  };

  const usuariosFiltrados = usuarios.filter(u => {
    const coincideTexto =
      (u.NOMBRE?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
      (u.CORREO?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
      (u.USUARIO?.toLowerCase() ?? '').includes(searchTerm.toLowerCase());

    const estadoNombre = u.ESTADO_NOMBRE || 'Desconocido';
    const coincideEstado = filtroEstado === 'Todos' || filtroEstado === estadoNombre;

    return coincideTexto && coincideEstado;
  });

  const indiceInicial = (paginaActual - 1) * usuariosPorPagina;
  const usuariosPaginados = usuariosFiltrados.slice(indiceInicial, indiceInicial + usuariosPorPagina);
  const totalPaginas = Math.ceil(usuariosFiltrados.length / usuariosPorPagina);

  const cambiarPagina = (pagina) => {
    if (pagina >= 1 && pagina <= totalPaginas) {
      setPaginaActual(pagina);
    }
  };

  const editarUsuario = (usuario) => {
    const idAdminStorage = localStorage.getItem('adminId');
    if (idAdminStorage) {
      setAdminId(parseInt(idAdminStorage));
    }
    setUsuarioEditar(usuario);
    setModoEdicion(true);
    setTimeout(() => setShowModal(true), 100);
  };

  const abrirNuevoUsuario = () => {
    setModoEdicion(false);
    setUsuarioEditar(null);
    setShowModal(true);
  };

  const obtenerColorBadge = (nombre) => {
    switch (nombre.toLowerCase()) {
      case 'activo': return 'bg-success';
      case 'inactivo': return 'bg-danger';
      case 'suspendido': return 'bg-warning';
      case 'bloqueado': return 'bg-secondary';
      default: return 'bg-dark';
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="fw-bold mb-0">Registro General</h3>
      </div>

      <hr className="mb-4" />

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-4">
          <button className="btn btn-primary" onClick={abrirNuevoUsuario}>
            Nuevo
          </button>

          <div className="dropdown">
            <button
              className="btn btn-outline-danger dropdown-toggle d-flex align-items-center"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <FaChevronDown className="me-2 text-danger" />
              {filtroEstado}
            </button>
            <ul className="dropdown-menu">
              {estadosFiltro.map((estado, index) => (
                <li key={index}>
                  <button
                    className="dropdown-item"
                    type="button"
                    onClick={() => setFiltroEstado(estado)}
                  >
                    {estado}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <input
          type="text"
          className="form-control w-25"
          placeholder="Buscar usuario..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <table className="table table-striped table-hover">
        <thead className="table-dark">
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Usuario</th>
            <th>Contraseña</th>
            <th>Estado</th>
            <th>Rol</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuariosPaginados.map(u => {
            const estadoNombre = u.ESTADO_NOMBRE || 'Desconocido';
            const estadoBadge = obtenerColorBadge(estadoNombre);

            return (
              <tr key={u.ID}>
                <td>{u.NOMBRE}</td>
                <td>{u.CORREO}</td>
                <td>{u.USUARIO}</td>
                <td>********</td>
                <td>
                  <span className={`badge rounded-pill ${estadoBadge}`}>
                    {estadoNombre}
                  </span>
                </td>
                <td>{u.ROLE_NOMBRE}</td>
                <td>
                  <button className="btn btn-sm btn-warning me-2" onClick={() => editarUsuario(u)}>
                    <FaEdit />
                  </button>
                </td>
              </tr>
            );
          })}
          {usuariosPaginados.length === 0 && (
            <tr>
              <td colSpan="7" className="text-center">
                No se encontraron usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="d-flex justify-content-end">
        <nav>
          <ul className="pagination">
            <li className={`page-item ${paginaActual === 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => cambiarPagina(paginaActual - 1)}>&laquo;</button>
            </li>
            {Array.from({ length: totalPaginas }, (_, i) => (
              <li key={i + 1} className={`page-item ${paginaActual === i + 1 ? 'active' : ''}`}>
                <button className="page-link" onClick={() => cambiarPagina(i + 1)}>
                  {i + 1}
                </button>
              </li>
            ))}
            <li className={`page-item ${paginaActual === totalPaginas ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => cambiarPagina(paginaActual + 1)}>&raquo;</button>
            </li>
          </ul>
        </nav>
      </div>

      <NuevoUsuarioModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onUsuarioCreado={cargarUsuarios}
        modoEdicion={modoEdicion}
        usuarioEditar={usuarioEditar}
        idAdmin={adminId}
      />
    </div>
  );
};

export default RegistrarUsuario;
