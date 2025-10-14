// src/pages/NuevoProductoModal.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { validarCamposObligatorios } from "../utils/validations";
import { compressImage } from "../utils/compressImage";
import { toast } from "react-toastify";
import GestionLotes from "../components/GestionLotes";

// Base coherente con el resto del front: usamos `${API_BASE}/api`
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const api = axios.create({ baseURL: `${API_BASE}/api` });

const NuevoProductoModal = ({ onClose, onProductoGuardado }) => {
  // PASO (1 = datos producto, 2 = gestión de lotes)
  const [paso, setPaso] = useState(1);

  // ---- PASO 1: Producto ----
  const [formData, setFormData] = useState({
    nombre: "",
    precioVenta: "",
    categoria: "",
    unidad: "",
    estado: "",
    imagen: null,
  });

  const [unidades, setUnidades] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [estados, setEstados] = useState([]);
  const [errores, setErrores] = useState({});
  const [loading, setLoading] = useState(false);

  // ---- PASO 2: Lote ----
  const [loteForm, setLoteForm] = useState({
    numeroLoteId: "",
    codigoLote: "",
    fechaVencimiento: "",
    cantidad: "",
  });

  // catálogos
  useEffect(() => {
    (async () => {
      try {
        const [resUnidades, resCategorias, resEstados] = await Promise.all([
          api.get(`/unidadmedida`),
          api.get(`/categoria-productos`),
          api.get(`/estados-productos`),
        ]);
        setUnidades(resUnidades.data || []);
        setCategorias(resCategorias.data || []);
        setEstados(resEstados.data || []);
      } catch (err) {
        console.error("Error cargando catálogos:", err);
        toast.error("Error al cargar catálogos");
      }
    })();
  }, []);

  // ---- Handlers paso 1 ----
  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "imagen") {
      setFormData((s) => ({ ...s, imagen: files?.[0] || null }));
    } else {
      setFormData((s) => ({ ...s, [name]: value }));
    }
    setErrores((s) => ({ ...s, [name]: "" }));
  };

  const validarPaso1 = () => {
    const camposObligatorios = ["nombre", "precioVenta", "categoria", "unidad", "estado"];
    const errs = validarCamposObligatorios(formData, camposObligatorios) || {};
    if (!formData.imagen) errs.imagen = "La imagen es obligatoria";
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const irAPaso2 = async (e) => {
    e.preventDefault();
    if (!validarPaso1()) return;
    setPaso(2);
  };

  // ---- Guardado final (producto + producto_por_lote) ----
  const handleSubmitCompleto = async () => {
    // Validar lote
    const errsLote = {};
    if (!loteForm.numeroLoteId) errsLote.numeroLoteId = "Seleccione un número de lote";
    if (!loteForm.cantidad || Number(loteForm.cantidad) <= 0)
      errsLote.cantidad = "Ingrese una cantidad válida";

    if (loteForm.fechaVencimiento) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fv = new Date(loteForm.fechaVencimiento);
      fv.setHours(0, 0, 0, 0);
      if (isNaN(fv.getTime())) errsLote.fechaVencimiento = "Fecha inválida";
      else if (fv < hoy) errsLote.fechaVencimiento = "No puede ser anterior a hoy";
    }
    if (Object.keys(errsLote).length) {
      toast.error("Corrige los campos del lote.");
      return;
    }

    try {
      setLoading(true);

      // 1) Crear producto
      const fd = new FormData();
      fd.append("nombre", formData.nombre);
      fd.append("precioVenta", Number(formData.precioVenta));
      fd.append("categoria", Number(formData.categoria));
      fd.append("unidad", Number(formData.unidad));
      fd.append("estado", Number(formData.estado));

      // coherente con otras vistas (userData en local/session)
      const usuarioId =
        JSON.parse(localStorage.getItem("userData"))?.id ||
        JSON.parse(sessionStorage.getItem("userData"))?.id ||
        localStorage.getItem("usuario_id") ||
        1;
      fd.append("usuarioId", usuarioId);

      const compressed = await compressImage(formData.imagen);
      fd.append("imagen", compressed || formData.imagen);

      const resProducto = await api.post(`/productos`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!(resProducto.status === 201 || resProducto.status === 200)) {
        toast.error("❌ Error al crear producto.");
        setLoading(false);
        return;
      }

      const productoId =
        resProducto.data?.id ||
        resProducto.data?.productoId ||
        resProducto.data?.ID;

      if (!productoId) {
        toast.error("No se obtuvo el ID del producto creado.");
        setLoading(false);
        return;
      }

      // 2) Registrar cantidad por lote
      const payloadLote = {
        productoId,
        loteId: Number(loteForm.numeroLoteId),
        cantidad: Number(loteForm.cantidad),
        ...(loteForm.fechaVencimiento
          ? { fechaVencimiento: loteForm.fechaVencimiento }
          : {}),
      };

      const resPPL = await api.post(`/producto-por-lote`, payloadLote);

      if (resPPL.status === 201 || resPPL.status === 200) {
        toast.success("Producto y lote guardados correctamente");
        onProductoGuardado?.({
          producto: resProducto.data,
          porLote: resPPL.data,
        });
        onClose?.();
      } else {
        toast.error("❌ Error al registrar el lote del producto.");
      }
    } catch (error) {
      console.error("❌ Error en guardado completo:", error);
      const msg = error?.response?.data?.message || "Error inesperado.";
      toast.error(`⚠️ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (campo) => `form-control ${errores[campo] ? "is-invalid" : ""}`;
  const selectClass = (campo) => `form-select ${errores[campo] ? "is-invalid" : ""}`;

  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          {/* HEADER */}
          <div className="modal-header">
            <h5 className="modal-title">
              {paso === 1 ? "Agregar Nuevo Producto" : "Gestión de Lotes"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          {/* BODY */}
          <div className="modal-body">
            {paso === 1 ? (
              <form onSubmit={irAPaso2} noValidate>
                <div className="row g-3">
                  {/* Nombre */}
                  <div className="col-md-6">
                    <label className="form-label">Nombre</label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      className={inputClass("nombre")}
                      required
                    />
                    {errores.nombre && <div className="invalid-feedback">{errores.nombre}</div>}
                  </div>

                  {/* Precio Venta */}
                  <div className="col-md-6">
                    <label className="form-label">Precio Venta</label>
                    <input
                      type="number"
                      name="precioVenta"
                      value={formData.precioVenta}
                      onChange={handleChange}
                      className={inputClass("precioVenta")}
                      required
                    />
                    {errores.precioVenta && (
                      <div className="invalid-feedback">{errores.precioVenta}</div>
                    )}
                  </div>

                  {/* Categoría */}
                  <div className="col-md-6">
                    <label className="form-label">Categoría</label>
                    <select
                      name="categoria"
                      value={formData.categoria}
                      onChange={handleChange}
                      className={selectClass("categoria")}
                      required
                    >
                      <option value="">Seleccione una categoría</option>
                      {categorias.map((cat) => (
                        <option key={cat.ID || cat.id} value={cat.ID || cat.id}>
                          {cat.NOMBRE || cat.nombre}
                        </option>
                      ))}
                    </select>
                    {errores.categoria && <div className="invalid-feedback">{errores.categoria}</div>}
                  </div>

                  {/* Unidad */}
                  <div className="col-md-6">
                    <label className="form-label">Unidad de Medida</label>
                    <select
                      name="unidad"
                      value={formData.unidad}
                      onChange={handleChange}
                      className={selectClass("unidad")}
                      required
                    >
                      <option value="">Seleccione una unidad</option>
                      {unidades.map((um) => (
                        <option key={um.ID || um.id} value={um.ID || um.id}>
                          {um.NOMBRE || um.nombre}
                        </option>
                      ))}
                    </select>
                    {errores.unidad && <div className="invalid-feedback">{errores.unidad}</div>}
                  </div>

                  {/* Estado */}
                  <div className="col-md-6">
                    <label className="form-label">Estado</label>
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className={selectClass("estado")}
                      required
                    >
                      <option value="">Seleccione un estado</option>
                      {estados.map((est) => (
                        <option key={est.ID || est.id} value={est.ID || est.id}>
                          {est.NOMBRE || est.nombre}
                        </option>
                      ))}
                    </select>
                    {errores.estado && <div className="invalid-feedback">{errores.estado}</div>}
                  </div>

                  {/* Imagen */}
                  <div className="col-md-6">
                    <label className="form-label">Cargar Imagen</label>
                    <input
                      type="file"
                      name="imagen"
                      onChange={handleChange}
                      className={`form-control ${errores.imagen ? "is-invalid" : ""}`}
                      accept="image/*"
                      required
                    />
                    {errores.imagen && <div className="invalid-feedback">{errores.imagen}</div>}
                  </div>
                </div>

                {/* Footer del paso 1 */}
                <div className="d-flex justify-content-end mt-4">
                  <button type="submit" className="btn btn-primary">
                    Siguiente
                  </button>
                </div>
              </form>
            ) : (
              // PASO 2: Gestión de Lotes
              <GestionLotes
                values={loteForm}
                onChange={({ field, value }) =>
                  setLoteForm((prev) => ({ ...prev, [field]: value }))
                }
                onAtras={() => setPaso(1)}
                onGuardar={handleSubmitCompleto}
                loading={loading}
              />
            )}
          </div>

          <div className="modal-footer d-none" />
        </div>
      </div>
    </div>
  );
};

export default NuevoProductoModal;
