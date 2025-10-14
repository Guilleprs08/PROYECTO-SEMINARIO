// frontend/src/components/ActualizarProducto.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import GestionLotes from "../components/GestionLotes";

// ===== Host/BASE seguros =====
const API_HOST =
  import.meta.env?.VITE_API_HOST ||
  import.meta.env?.VITE_API_BASE ||
  import.meta.env?.VITE_API_BASE_URL ||
  "http://localhost:3001";
const API_BASE = `${API_HOST.replace(/\/+$/, "")}/api`;

// DD/MM/YYYY -> YYYY-MM-DD
const toISO = (ddmmyyyy) => {
  if (!ddmmyyyy) return "";
  if (ddmmyyyy.includes("-")) return ddmmyyyy;
  const [d, m, y] = ddmmyyyy.split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const EditarProductoModal = ({
  producto,
  categorias,
  unidades,
  estados,
  onClose,
  onProductoActualizado,
}) => {
  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);

  // Paso 1 (sin precioCosto)
  const [formData, setFormData] = useState({
    id: "",
    nombre: "",
    precioVenta: "",
    categoria: "",
    unidad: "",
    estado: "",
    imagen: null,
  });
  const [errores, setErrores] = useState({});

  // Paso 2 (edición por lote: cantidad = DELTA opcional)
  const [loteForm, setLoteForm] = useState({
    idPorLote: "",
    numeroLoteId: "",
    fechaVencimiento: "",
    cantidad: "",
  });
  const [lotesLoading, setLotesLoading] = useState(false);
  const [lotesError, setLotesError] = useState("");
  const [tieneLote, setTieneLote] = useState(true);

  useEffect(() => {
    if (!producto?.id) return;

    setFormData({
      id: producto.id,
      nombre: producto.nombre || "",
      precioVenta: producto.precioVenta ?? "",
      categoria: producto.categoria ?? "",
      unidad: producto.unidad ?? "",
      estado: producto.estado ?? "",
      imagen: null,
    });

    // Precargar lote(s) del producto — probamos variantes de endpoint
    (async () => {
      setLotesLoading(true);
      setLotesError("");
      try {
        const pid = encodeURIComponent(producto.id);
        const candidates = [
          `${API_BASE}/producto-por-lote?productoId=${pid}`,
          `${API_BASE}/inventario/producto-por-lote?productoId=${pid}`,
          `${API_BASE}/productos-por-lote?productoId=${pid}`,
        ];

        let items = [];
        let ok = false;
        for (const url of candidates) {
          try {
            const res = await axios.get(url);
            if (Array.isArray(res.data)) {
              items = res.data;
              ok = true;
              break;
            }
          } catch (_) {
            // intentar siguiente
          }
        }
        if (!ok) {
          setTieneLote(false);
          setLoteForm({ idPorLote: "", numeroLoteId: "", fechaVencimiento: "", cantidad: "" });
          setLotesError("No se pudieron cargar los lotes del producto.");
          toast.error("No se pudieron cargar los lotes del producto.");
          return;
        }

        if (items.length === 0) {
          setTieneLote(false);
          setLoteForm({ idPorLote: "", numeroLoteId: "", fechaVencimiento: "", cantidad: "" });
        } else {
          const first = items[0];
          setTieneLote(true);
          setLoteForm({
            idPorLote: first.id ?? first.ID ?? "",
            numeroLoteId: first.loteId ?? first.LOTE_ID ?? first.LOTE ?? "",
            fechaVencimiento: toISO(first.fechaVencimiento ?? first.FECHA_VENCIMIENTO ?? ""),
            cantidad: "",
          });
        }
      } finally {
        setLotesLoading(false);
      }
    })();
  }, [producto]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === "imagen") {
      setFormData((p) => ({ ...p, imagen: files?.[0] || null }));
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
      setErrores((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validarPaso1 = () => {
    const e = {};
    if (!formData.nombre?.trim()) e.nombre = "Requerido";
    if (formData.precioVenta === "" || Number(formData.precioVenta) <= 0) e.precioVenta = "Mayor a 0";
    if (!formData.categoria) e.categoria = "Requerido";
    if (!formData.unidad) e.unidad = "Requerido";
    if (!formData.estado) e.estado = "Requerido";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const irAPaso2 = (e) => {
    e.preventDefault();
    if (!validarPaso1()) return;
    setPaso(2);
  };

  const handleGuardarTodo = async () => {
    // Validación de lote (edición como DELTA opcional)
    if (!loteForm.idPorLote) {
      toast.error("Este producto no tiene lotes para editar.");
      return;
    }
    if (loteForm.cantidad !== "" && loteForm.cantidad !== undefined) {
      const n = Number(loteForm.cantidad);
      if (Number.isNaN(n) || n <= 0) {
        toast.error("Si ingresa cantidad, debe ser mayor a 0");
        return;
      }
    }
    if (loteForm.fechaVencimiento) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const fv = new Date(loteForm.fechaVencimiento); fv.setHours(0,0,0,0);
      if (Number.isNaN(fv.getTime())) return toast.error("Fecha inválida");
      if (fv < hoy) return toast.error("La fecha no puede ser anterior a hoy");
    }

    try {
      setLoading(true);

      // 1) PUT producto (solo campos enviados)
      const data = new FormData();
      const nombreTrim = (formData.nombre || "").trim();
      if (nombreTrim) data.append("nombre", nombreTrim);
      if (formData.precioVenta !== "" && !Number.isNaN(Number(formData.precioVenta)))
        data.append("precioVenta", Number(formData.precioVenta));
      if (formData.categoria) data.append("categoria", Number(formData.categoria));
      if (formData.unidad) data.append("unidad", Number(formData.unidad));
      if (formData.estado) data.append("estado", Number(formData.estado));
      if (formData.imagen) data.append("imagen", formData.imagen);

      if ([...data.keys()].length > 0) {
        await axios.put(`${API_BASE}/productos/${formData.id}`, data, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      // 2) PUT producto-por-lote/:id  (cantidad = DELTA opcional; fecha opcional)
      const payloadPPL = {};
      if (loteForm.cantidad !== "" && loteForm.cantidad !== undefined) {
        payloadPPL.cantidad = Number(loteForm.cantidad);
      }
      if (loteForm.fechaVencimiento !== undefined) {
        payloadPPL.fechaVencimiento = loteForm.fechaVencimiento || "";
      }

      if (Object.keys(payloadPPL).length > 0) {
        // intentamos variantes de ruta
        const endpoints = [
          `${API_BASE}/producto-por-lote/${loteForm.idPorLote}`,
          `${API_BASE}/inventario/producto-por-lote/${loteForm.idPorLote}`,
          `${API_BASE}/productos-por-lote/${loteForm.idPorLote}`,
        ];
        let updated = false;
        let lastErr = null;
        for (const url of endpoints) {
          try {
            await axios.put(url, payloadPPL);
            updated = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!updated) throw lastErr || new Error("No se pudo actualizar el lote");
      }

      toast.success("Cambios guardados correctamente");
      onProductoActualizado?.(true);
      onClose?.();
    } catch (err) {
      console.error("❌ Error al guardar cambios:", err);
      toast.error(err?.response?.data?.message || "Error al guardar cambios");
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
            <h5 className="modal-title">{paso === 1 ? "Actualizar Producto" : "Gestión de Lotes"}</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={loading}></button>
          </div>

          {/* BODY */}
          <div className="modal-body">
            {paso === 1 ? (
              <form onSubmit={irAPaso2} noValidate>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Nombre</label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      className={inputClass("nombre")}
                    />
                    {errores.nombre && <div className="invalid-feedback">{errores.nombre}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Precio Venta</label>
                    <input
                      type="number"
                      name="precioVenta"
                      value={formData.precioVenta}
                      onChange={handleChange}
                      className={inputClass("precioVenta")}
                    />
                    {errores.precioVenta && <div className="invalid-feedback">{errores.precioVenta}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Categoría</label>
                    <select
                      name="categoria"
                      value={formData.categoria}
                      onChange={handleChange}
                      className={selectClass("categoria")}
                    >
                      <option value="">Seleccione una categoría</option>
                      {categorias.map((cat) => (
                        <option key={cat.ID} value={cat.ID}>{cat.NOMBRE}</option>
                      ))}
                    </select>
                    {errores.categoria && <div className="invalid-feedback">{errores.categoria}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Unidad de Medida</label>
                    <select
                      name="unidad"
                      value={formData.unidad}
                      onChange={handleChange}
                      className={selectClass("unidad")}
                    >
                      <option value="">Seleccione una unidad</option>
                      {unidades.map((um) => (
                        <option key={um.ID} value={um.ID}>{um.NOMBRE}</option>
                      ))}
                    </select>
                    {errores.unidad && <div className="invalid-feedback">{errores.unidad}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Estado</label>
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className={selectClass("estado")}
                    >
                      <option value="">Seleccione un estado</option>
                      {estados.map((est) => (
                        <option key={est.ID} value={est.ID}>{est.NOMBRE}</option>
                      ))}
                    </select>
                    {errores.estado && <div className="invalid-feedback">{errores.estado}</div>}
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Actualizar Imagen</label>
                    <input type="file" name="imagen" onChange={handleChange} className="form-control" accept="image/*" />
                  </div>
                </div>

                <div className="d-flex justify-content-end mt-4">
                  <button type="submit" className="btn btn-primary">Siguiente</button>
                </div>
              </form>
            ) : (
              <>
                {lotesLoading ? (
                  <div className="text-center py-4">Cargando lotes…</div>
                ) : lotesError ? (
                  <div className="alert alert-danger">{lotesError}</div>
                ) : !tieneLote ? (
                  <div className="alert alert-warning">
                    Este producto aún no tiene lotes registrados. No es posible editar un lote inexistente.
                  </div>
                ) : (
                  <GestionLotes
                    modo="editar"
                    values={loteForm}
                    onChange={({ field, value }) =>
                      setLoteForm((prev) => ({ ...prev, [field]: value }))
                    }
                    onAtras={() => setPaso(1)}
                    onGuardar={handleGuardarTodo}
                    loading={loading || !loteForm.idPorLote}
                  />
                )}
              </>
            )}
          </div>

          <div className="modal-footer d-none"></div>
        </div>
      </div>
    </div>
  );
};

export default EditarProductoModal;
