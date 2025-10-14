import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Search,
  Info,
  Tag,
  Layers,
  Package,
  DollarSign,
  Calendar,
  Edit,
  Save,
} from "lucide-react";
import { toast } from "react-toastify";
import "../styles/actualizar-producto.css";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const ActualizarProducto = () => {
  const [isEditable, setIsEditable] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [formData, setFormData] = useState({
    id: "",
    codigo: "",
    nombre: "",
    categoria: "",
    unidad: "",
    cantidad: 0,
    fechaVencimiento: "",
    precioVenta: 0,
    precioCosto: 0,
    estado: "",
  });
  const [originalData, setOriginalData] = useState({});

  // Cargar categorías y unidades
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, uniRes] = await Promise.all([
          axios.get(`${API_URL}/api/categoria-productos`),
          axios.get(`${API_URL}/api/unidadmedida`),
        ]);
        setCategorias(catRes.data || []);
        setUnidades(uniRes.data || []);

      } catch {
        toast.error("Error al cargar categorías o unidades.");
      }
    };
    fetchData();
  }, []);

  // Buscar productos
  const buscarProducto = useCallback(async (query) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await axios.get(
        `${API_URL}/api/actualizar-producto/buscar?nombre=${encodeURIComponent(query.trim())}`
      );
      setSuggestions(res.data || []);
    } catch {
      toast.error("No se pudo buscar el producto.");
    }
  }, []);

  // Estado traducido
  const traducirEstado = (estado) => {
    switch (estado) {
      case "ACTIVO": return "Activo";
      case "POR_VENCER": return "Por vencer";
      case "BAJO_STOCK": return "Bajo de stock";
      default: return estado;
    }
  };

  const obtenerClaseEstado = (estado) => {
    switch (estado) {
      case "ACTIVO": return "estado-verde";
      case "POR_VENCER": return "estado-rojo";
      case "BAJO_STOCK": return "estado-amarillo";
      default: return "";
    }
  };

  // Delay de búsqueda
  useEffect(() => {
    const delay = setTimeout(() => buscarProducto(searchValue), 500);
    return () => clearTimeout(delay);
  }, [searchValue, buscarProducto]);

  // Seleccionar producto por ID
  const seleccionarProducto = async (producto) => {
    try {
      const res = await axios.get(`${API_URL}/api/actualizar-producto/${producto.ID}`);
      if (res.data) {
        const p = res.data;
        const data = {
          id: p.ID || "",
          codigo: p.CODIGO || "",
          nombre: p.NOMBRE || "",
          categoria: p.CATEGORIA_ID || "",
          unidad: p.UNIDAD_MEDIDA_ID || "",  // ✅ Corregido
          cantidad: p.CANTIDAD || 0,
          fechaVencimiento: p.FECHAVENCIMIENTO || "",
          precioVenta: p.PRECIOVENTA || 0,
          precioCosto: p.PRECIOCOSTO || 0,
          estado: p.ESTADO || "",
        };

        setFormData(data);
        setOriginalData(data);
        setSearchValue(p.NOMBRE || "");
        setSuggestions([]);
      }
    } catch {
      toast.error("No se pudo cargar la información del producto.");
    }
  };

  // Cambiar valores
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ["precioVenta", "precioCosto", "cantidad"].includes(name)
        ? Math.max(0, Number(value))
        : value,
    }));
  };

  const ajustarCantidad = (cambio) => {
    setFormData((prev) => ({
      ...prev,
      cantidad: Math.max(prev.cantidad + cambio, 0),
    }));
  };



  const ajustarStockRapido = (cantidad) => {
    setFormData((prev) => ({
      ...prev,
      cantidad: Math.max(prev.cantidad + cantidad, 0),
    }));
  };

  // Guardar cambios
// ... (importaciones y hooks permanecen iguales)

// Guardar cambios
const toggleEdit = async () => {
  if (isEditable) {
    const cambios = {};

    Object.keys(formData).forEach((key) => {
      if (key === "categoria" || key === "unidad") {
        if (String(formData[key]) !== String(originalData[key])) {
          if (key === "categoria") cambios["categoria_id"] = formData[key];
          if (key === "unidad") cambios["unidad_id"] = formData[key];
        }
      } else {
        if (formData[key] !== originalData[key]) {
          cambios[key] = formData[key];
        }
      }
    });

    if (Object.keys(cambios).length === 0) {
      toast.info("No se realizaron cambios.");
      setIsEditable(false);
      return;
    }

    if (cambios.nombre && !cambios.nombre.trim())
      return toast.error("El nombre es obligatorio");
    if (cambios.categoria_id && !cambios.categoria_id)
      return toast.error("Seleccione una categoría");
    if (cambios.unidad_id && !cambios.unidad_id)
      return toast.error("Seleccione una unidad");
    if (cambios.precioVenta !== undefined && cambios.precioVenta <= 0)
      return toast.error("Precio de venta inválido");

    try {
      await axios.put(`${API_URL}/api/actualizar-producto/${formData.id}`, cambios);
      toast.success("Producto actualizado correctamente.");

      // 🔹 Limpiar todo después de guardar
      setFormData({
        id: "",
        codigo: "",
        nombre: "",
        categoria: "",
        unidad: "",
        cantidad: 0,
        fechaVencimiento: "",
        precioVenta: 0,
        precioCosto: 0,
        estado: "",
      });
      setOriginalData({});
      setSearchValue("");
      setSuggestions([]);
      setIsEditable(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo actualizar el producto.");
    }
  } else {
    setIsEditable(true);
  }
};



  return (
    <div className="container-fluid py-4 actualizar-producto">
      <div className="row">
        {/* Columna izquierda */}
        <div className="col-lg-4 mb-4">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0 d-flex align-items-center">
                <Info className="me-2" size={18} /> Información del Producto
              </h5>
            </div>
            <div className="card-body">
              {/* Buscar producto */}
              <div className="search-section mb-3 position-relative">
                <label className="form-label fw-semibold mb-2">
                  <Search className="me-2" size={16} /> Buscar Producto
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Nombre del producto..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
                {suggestions.length > 0 && (
                  <ul className="list-group position-absolute w-100" style={{ zIndex: 1000 }}>
                    {suggestions.map((prod) => (
                      <li
                        key={prod.ID}
                        className="list-group-item list-group-item-action"
                        style={{ cursor: "pointer" }}
                        onClick={() => seleccionarProducto(prod)}
                      >
                        {prod.NOMBRE}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Datos */}
              <h5>{formData.nombre || "Seleccione un producto"}</h5>
              <p className="text-muted mb-2">Código: {formData.codigo}</p>
              <p className="text-muted mb-3">
                Categoría: {categorias.find((c) => c.ID === formData.categoria)?.NOMBRE || ""}
              </p>
              <p className="text-muted mb-3">
                Unidad: {unidades.find((u) => u.ID === formData.unidad)?.NOMBRE || ""}
              </p>
              <div className="mb-3">
                <label className="form-label fw-semibold">Estado</label>
                <div className={`status-badge ${obtenerClaseEstado(formData.estado)}`}>
                  {traducirEstado(formData.estado)}
                </div>
              </div>
              <div className="row text-start">
                <div className="col-6">
                  <small className="text-muted">Stock Actual</small>
                  <div className="fw-bold fs-5 text-primary">{formData.cantidad}</div>
                </div>
                <div className="col-6">
                  <small className="text-muted">Precio Actual</small>
                  <div className="fw-bold fs-5 text-success">
                    Q {Number(formData.precioVenta).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="col-lg-8">
          <div className="row g-4">
            {/* Información Básica */}
            <div className="col-12">
              <div className="card section-card shadow-sm">
                <div className="card-header d-flex align-items-center">
                  <Tag className="me-3 text-primary" size={18} />
                  <h6 className="mb-0">Información Básica</h6>
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Código de Barras</label>
                    <input
                      type="text"
                      className="form-control"
                      name="codigo"
                      value={formData.codigo}
                      onChange={handleChange}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">Nombre del Producto</label>
                    <input
                      type="text"
                      className="form-control"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Clasificación */}
            <div className="col-md-6">
              <div className="card section-card shadow-sm h-100">
                <div className="card-header d-flex align-items-center">
                  <Layers className="me-3 text-success" size={18} />
                  <h6 className="mb-0">Clasificación</h6>
                </div>
                <div className="card-body">
                  <label className="form-label fw-semibold">Categoría</label>
                  <select
                    className="form-select mb-3"
                    name="categoria"
                    value={formData.categoria}
                    onChange={handleChange}
                    disabled={!isEditable}
                  >
                    <option value="">Seleccione una categoría</option>
                    {categorias.map((cat) => (
                      <option key={cat.ID} value={cat.ID}>
                        {cat.NOMBRE}
                      </option>
                    ))}
                  </select>

                  <label className="form-label fw-semibold">Unidad de Medida</label>
                  <select
                    className="form-select"
                    name="unidad"
                    value={formData.unidad}
                    onChange={handleChange}
                    disabled={!isEditable}
                  >
                    <option value="">Seleccione una unidad</option>
                    {unidades.map((uni) => (
                      <option key={uni.ID} value={uni.ID}>
                        {uni.NOMBRE}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Inventario */}
            <div className="col-md-6">
              <div className="card section-card shadow-sm h-100">
                <div className="card-header d-flex align-items-center">
                  <Package className="me-3 text-warning" size={18} />
                  <h6 className="mb-0">Control de Inventario</h6>
                </div>
                <div className="card-body">
                  <label className="form-label fw-semibold">Cantidad en Stock</label>
                  <div className="input-group mb-3">
                    <button
                      className="btn btn-outline-danger"
                      type="button"
                      onClick={() => ajustarCantidad(-1)}
                      disabled={!isEditable}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="form-control text-center fw-bold"
                      value={formData.cantidad}
                      readOnly
                    />
                    <button
                      className="btn btn-outline-success"
                      type="button"
                      onClick={() => ajustarCantidad(1)}
                      disabled={!isEditable}
                    >
                      +
                    </button>
                  </div>
                  <div className="btn-group w-100">
                    {[5, 10, 25].map((inc) => (
                      <button
                        key={inc}
                        className="btn btn-sm btn-outline-warning"
                        onClick={() => ajustarStockRapido(inc)}
                        disabled={!isEditable}
                      >
                        +{inc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Precios */}
            <div className="col-md-6">
              <div className="card section-card shadow-sm h-100">
                <div className="card-header d-flex align-items-center">
                  <DollarSign className="me-3 text-info" size={18} />
                  <h6 className="mb-0">Gestión de Precios</h6>
                </div>
                <div className="card-body">
                  <label className="form-label fw-semibold">Precio de Venta</label>
                  <input
                    type="number"
                    className="form-control mb-3"
                    name="precioVenta"
                    value={formData.precioVenta}
                    onChange={handleChange}
                    disabled={!isEditable}
                  />
                  <label className="form-label fw-semibold">Precio de Costo</label>
                  <input
                    type="number"
                    className="form-control"
                    name="precioCosto"
                    value={formData.precioCosto}
                    onChange={handleChange}
                    disabled={!isEditable}
                  />
                </div>
              </div>
            </div>

            {/* Fecha vencimiento */}
            <div className="col-md-6">
              <div className="card section-card shadow-sm h-100">
                <div className="card-header d-flex align-items-center">
                  <Calendar className="me-3 text-danger" size={18} />
                  <h6 className="mb-0">Fecha de Vencimiento</h6>
                </div>
                <div className="card-body">
                  <label className="form-label fw-semibold">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    className="form-control"
                    name="fechaVencimiento"
                    value={formData.fechaVencimiento}
                    onChange={handleChange}
                    disabled={!isEditable}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botón flotante */}
      <div className="fixed-edit-button">
        <button
          className={`btn-toggle-edit ${isEditable ? "save" : "edit"}`}
          onClick={toggleEdit}
        >
          {isEditable ? (
            <>
              <Save size={18} /> Guardar
            </>
          ) : (
            <>
              <Edit size={18} /> Editar
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ActualizarProducto;
