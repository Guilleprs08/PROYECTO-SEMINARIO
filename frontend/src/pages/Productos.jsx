// frontend/src/pages/Productos.jsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { FaPlus, FaSearch, FaBoxOpen, FaCheckCircle } from "react-icons/fa";
import "../styles/productos.css";
import NuevoProductoModal from "../components/NuevoProductoModal";
import ActualizarProducto from "../components/ActualizarProducto";
import { confirmarAccion } from "../utils/confirmations";

/**
 * Configuración de rutas base
 */
const API_HOST =
  import.meta.env?.VITE_API_HOST ||
  import.meta.env?.VITE_API_BASE ||
  import.meta.env?.VITE_API_BASE_URL ||
  "http://localhost:3001";

const API_BASE = `${API_HOST.replace(/\/+$/, "")}/api`;

/** Construye la URL absoluta de la imagen */
const buildImgUrl = (img) => {
  if (!img) return "";
  if (/^https?:\/\//i.test(img)) return img;
  if (img.startsWith("/")) return `${API_HOST.replace(/\/+$/, "")}${img}`;
  return `${API_BASE.replace(/\/+$/, "")}/${img.replace(/^\/+/, "")}`;
};

// 🔹 Estado administrativo legible
const formatEstado = (estado) => {
  if (estado === 1 || String(estado) === "1") return "ACTIVO";
  if (estado === 0 || String(estado) === "0") return "INACTIVO";
  if (!estado && estado !== 0) return "";
  return String(estado)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
};

const Productos = () => {
  const [productos, setProductos] = useState([]);
  const [estadosAdm, setEstadosAdm] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstadoAdm, setFiltroEstadoAdm] = useState("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroUnidad, setFiltroUnidad] = useState("todos");

  const [showEditarModal, setShowEditarModal] = useState(false);
  const [productoEditar, setProductoEditar] = useState(null);

  const [loading, setLoading] = useState(true);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/productos`);
      const data = Array.isArray(res.data) ? res.data : [];

      // Asegurar imagen absoluta y normalizar
      const normalizados = data.map((p) => ({
        ...p,
        imagen: buildImgUrl(p.imagen),
        cantidad: Number(p.cantidad ?? 0),
        precioVenta: Number(p.precioVenta ?? 0),
        fechaVencimiento: p.fechaVencimiento || null,
        estadoDinamico: p.estadoDinamico || "Disponible",
      }));

      setProductos(normalizados);
    } catch (error) {
      console.error("❌ Error cargando productos:", error);
      setProductos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarProducto = async (id) => {
    await confirmarAccion({
      title: "¿Eliminar producto?",
      text: "Esta acción no se puede deshacer.",
      confirmButtonText: "Sí, eliminar",
      onConfirm: async () => {
        await axios.delete(`${API_BASE}/productos/${id}`);
        await fetchProductos();
      },
    });
  };

  const fetchFiltros = async () => {
    try {
      const [admRes, catRes, uniRes] = await Promise.allSettled([
        axios.get(`${API_BASE}/estados-productos`),
        axios.get(`${API_BASE}/categoria-productos`),
        axios.get(`${API_BASE}/unidadmedida`),
      ]);

      if (admRes.status === "fulfilled") setEstadosAdm(admRes.value.data || []);
      if (catRes.status === "fulfilled") setCategorias(catRes.value.data || []);
      if (uniRes.status === "fulfilled") setUnidades(uniRes.value.data || []);
    } catch (error) {
      console.error("❌ Error cargando filtros:", error);
    }
  };

  useEffect(() => {
    fetchProductos();
    fetchFiltros();
  }, []);

  const handleProductoGuardado = async () => {
    await fetchProductos();
  };

  const handleProductoActualizado = async () => {
    await fetchProductos();
  };

  const handleEditarProducto = (producto) => {
    setProductoEditar(producto);
    setShowEditarModal(true);
  };

  // 🔹 Filtrado local
  const productosFiltrados = useMemo(() => {
    const term = (busqueda || "").toLowerCase();

    return productos.filter((p) => {
      const nombre = (p.nombre || "").toLowerCase();
      const coincideBusqueda = !term || nombre.includes(term);

      const coincideEstadoAdm =
        filtroEstadoAdm === "todos" ||
        String(p.estado) === String(filtroEstadoAdm);

      const coincideCategoria =
        filtroCategoria === "todos" ||
        (p.categoriaNombre &&
          p.categoriaNombre.toLowerCase() === filtroCategoria.toLowerCase());

      const coincideUnidad =
        filtroUnidad === "todos" ||
        (p.unidadNombre &&
          p.unidadNombre.toLowerCase() === filtroUnidad.toLowerCase());

      return (
        coincideBusqueda && coincideEstadoAdm && coincideCategoria && coincideUnidad
      );
    });
  }, [productos, busqueda, filtroEstadoAdm, filtroCategoria, filtroUnidad]);

  // 🔹 Colores para estado dinámico
  const badgeClase = (estado) => {
    switch (estado) {
      case "Vencido":
        return "bg-danger";
      case "Por vencer":
        return "bg-warning text-dark";
      case "Stock bajo":
        return "bg-secondary";
      default:
        return "bg-success";
    }
  };

  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold text-primary">
          <FaBoxOpen className="me-2" />
          Agregar Productos
        </h2>
        <button
          className="btn btn-primary d-flex align-items-center"
          onClick={() => setShowModal(true)}
        >
          <FaPlus className="me-2" /> Nuevo Producto
        </button>
      </div>

      {/* Barra de filtros */}
      <div className="filtros-container mb-4">
        <div className="filtro-busqueda">
          <div className="input-group">
            <span className="input-group-text bg-white">
              <FaSearch />
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar productos..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <select
          className="filtro-select"
          value={filtroEstadoAdm}
          onChange={(e) => setFiltroEstadoAdm(e.target.value)}
        >
          <option value="todos">Todos</option>
          {estadosAdm.map((e) => (
            <option key={e.ID} value={e.ID}>
              {e.NOMBRE}
            </option>
          ))}
        </select>

        <select
          className="filtro-select"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          <option value="todos">Todas</option>
          {categorias.map((cat) => (
            <option key={cat.ID} value={cat.NOMBRE}>
              {cat.NOMBRE}
            </option>
          ))}
        </select>

        <select
          className="filtro-select"
          value={filtroUnidad}
          onChange={(e) => setFiltroUnidad(e.target.value)}
        >
          <option value="todos">Todas</option>
          {unidades.map((uni) => (
            <option key={uni.ID} value={uni.NOMBRE}>
              {uni.NOMBRE}
            </option>
          ))}
        </select>
      </div>

      {/* Cards de productos */}
      <div className="row">
        {loading ? (
          <div className="col-12 text-center mt-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Cargando...</span>
            </div>
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="col-12 text-center mt-5">
            <FaBoxOpen size={70} className="text-secondary mb-3" />
            <h5 className="fw-bold text-muted">No hay productos registrados</h5>
          </div>
        ) : (
          productosFiltrados.map((p) => (
            <div className="col-md-4 mb-4" key={p.id}>
              <div className="card shadow-sm h-100 border-0">
                <div className="card-body">
                  <div className="text-center mb-3">
                    {p.imagen ? (
                      <img
                        src={p.imagen}
                        alt={p.nombre}
                        className="img-fluid rounded"
                        style={{ maxHeight: "120px", objectFit: "contain" }}
                        onError={(e) => {
                          e.currentTarget.src = "";
                          e.currentTarget.alt = "Sin imagen";
                        }}
                      />
                    ) : (
                      <FaBoxOpen size={50} className="text-secondary" />
                    )}
                  </div>

                  <h5 className="fw-bold">{p.nombre || "Sin nombre"}</h5>

                  <p className="mb-1">
                    <strong>Cantidad:</strong> {Number(p.cantidad || 0)}
                  </p>
                  <p className="mb-1">
                    <strong>Vencimiento:</strong> {p.fechaVencimiento || "N/A"}
                  </p>
                  <p className="mb-1">
                    <strong>Precio:</strong> Q{(p.precioVenta || 0).toFixed(2)}
                  </p>

                  {/* Estado administrativo */}
                  <p className="mb-1">
                    <strong>Estado:</strong>{" "}
                    <span
                      className={`badge ${
                        Number(p.estado) === 1 ? "bg-success" : "bg-danger"
                      }`}
                    >
                      <FaCheckCircle className="me-1" />
                      {formatEstado(p.estado)}
                    </span>
                  </p>

                  {/* 👇 NUEVO: Estado dinámico */}
                  <p className="mb-3">
                    <strong>Estado dinámico:</strong>{" "}
                    <span className={`badge ${badgeClase(p.estadoDinamico)}`}>
                      {p.estadoDinamico}
                    </span>
                  </p>

                  <div className="d-flex justify-content-between">
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => handleEditarProducto(p)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminarProducto(p.id)}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <NuevoProductoModal
          onClose={() => setShowModal(false)}
          onProductoGuardado={handleProductoGuardado}
        />
      )}

      {showEditarModal && productoEditar && (
        <ActualizarProducto
          producto={productoEditar}
          categorias={categorias}
          unidades={unidades}
          estados={estadosAdm}
          onClose={() => setShowEditarModal(false)}
          onProductoActualizado={handleProductoActualizado}
        />
      )}
    </div>
  );
};

export default Productos;
