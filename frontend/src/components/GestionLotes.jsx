    // src/components/GestionLotes.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";

/* ===== API base y helpers (igual a todo el proyecto) ===== */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const get = (p, cfg = {}) =>
  axios.get(`${API_BASE}${p}`, {
    ...cfg,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
  });

/**
 * Props:
 *  - modo: "crear" | "editar" | "info"
 *  - values: {
 *      idPorLote?: number,          // si lo manejas
 *      productoId?: number,         // si lo necesitas en el flujo superior
 *      numeroLoteId: string|number, // ID de LOTE en BD
 *      fechaVencimiento: string,    // 'YYYY-MM-DD'
 *      cantidad: string|number      // en editar: DELTA a sumar (opcional)
 *      fechaVencimientoDisplay?: string // opcional para modo info
 *    }
 *  - onChange: ({ field, value }) => void
 *  - onGuardar: () => void
 *  - onAtras: () => void
 *  - loading?: boolean
 */
export default function GestionLotes({
  modo = "crear",
  values,
  onChange,
  onGuardar,
  onAtras,
  loading = false,
}) {
  const [lotes, setLotes] = useState([]);
  const [errors, setErrors] = useState({});

  const soloInfo = modo === "info";
  const esEditar = modo === "editar";
  const esCrear = modo === "crear";

  // Normalizador Oracle (MAYÚSCULAS) -> camel
  const mapLote = (row) => ({
    id: row?.ID ?? row?.id ?? null,
    codigo: row?.CODIGO_LOTE ?? row?.codigo_lote ?? row?.codigo ?? null,
    nombre: row?.NOMBRE ?? row?.nombre ?? "",
    fechaRegistro: row?.FECHA_REGISTRO ?? row?.fecha_registro ?? null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await get("/api/lotes");
        const arr = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setLotes(arr.map(mapLote).filter((x) => x.id || x.codigo));
      } catch (err) {
        console.error("Error cargando lotes:", err);
        toast.error("No se pudieron cargar los lotes");
      }
    })();
  }, []);

  const inputClass = (name) =>
    `form-control ${errors[name] ? "is-invalid" : ""}`;
  const selectClass = (name) =>
    `form-select ${errors[name] ? "is-invalid" : ""}`;

  const handle = (e) => {
    const { name, value } = e.target;
    onChange?.({ field: name, value });
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validar = () => {
    const e = {};

    if (!soloInfo) {
      // Lote (requerido)
      if (!values?.numeroLoteId) e.numeroLoteId = "Seleccione un número de lote";

      // Cantidad:
      //   - CREAR: obligatoria > 0
      //   - EDITAR: opcional; si viene, > 0
      if (esCrear) {
        const n = Number(values?.cantidad);
        if (values?.cantidad === "" || Number.isNaN(n) || n <= 0) {
          e.cantidad = "Ingrese una cantidad mayor a 0";
        }
      } else if (esEditar) {
        if (values?.cantidad !== "" && values?.cantidad !== undefined) {
          const n = Number(values.cantidad);
          if (Number.isNaN(n) || n <= 0) e.cantidad = "Si ingresa, debe ser > 0";
        }
      }

      // Fecha (opcional; válida si viene y no es pasada)
      if (values?.fechaVencimiento) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fv = new Date(values.fechaVencimiento);
        fv.setHours(0, 0, 0, 0);
        if (Number.isNaN(fv.getTime()))
          e.fechaVencimiento = "Fecha inválida (use YYYY-MM-DD)";
        else if (fv < hoy)
          e.fechaVencimiento = "No puede ser anterior a hoy";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleGuardar = (e) => {
    e?.preventDefault?.();
    if (soloInfo) return;
    if (!validar()) return;
    onGuardar?.();
  };

  // Texto bonito del lote seleccionado
  const loteSeleccionado = lotes.find(
    (l) => String(l.id) === String(values?.numeroLoteId)
  );
  const textoLote = loteSeleccionado
    ? `${loteSeleccionado.id} — ${loteSeleccionado.codigo ? `[${loteSeleccionado.codigo}] ` : ""}${loteSeleccionado.nombre || ""}`
    : values?.numeroLoteId
    ? String(values.numeroLoteId)
    : "";

  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary rounded-pill">Paso 2</span>
          <h5 className="mb-0">Gestión de Lotes</h5>
        </div>
      </div>

      <div className="card-body">
        <div className="row gy-4">
          {/* Izquierda */}
          <div className="col-12 col-lg-6">
            <div className="border rounded-3 p-3 h-100">
              <h6 className="mb-3">Lote #1</h6>

              {/* Número de Lote */}
              <div className="mb-3">
                <label className="form-label">Número de Lote</label>
                {soloInfo ? (
                  <input
                    type="text"
                    className="form-control"
                    value={textoLote || "N/A"}
                    readOnly
                  />
                ) : (
                  <select
                    name="numeroLoteId"
                    className={selectClass("numeroLoteId")}
                    value={values?.numeroLoteId || ""}
                    onChange={handle}
                    disabled={esEditar} // bloqueado en edición
                  >
                    <option value="">Seleccione un número de lote</option>
                    {lotes.map((l) => (
                      <option key={l.id ?? l.codigo} value={l.id}>
                        {l.id} — {l.codigo ? `[${l.codigo}] ` : ""}
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                )}
                {errors.numeroLoteId && (
                  <div className="invalid-feedback d-block">
                    {errors.numeroLoteId}
                  </div>
                )}
              </div>

              {/* Fecha de Vencimiento */}
              <div className="mb-0">
                <label className="form-label">Fecha de Vencimiento</label>
                {soloInfo ? (
                  <input
                    type="text"
                    className="form-control"
                    value={
                      values?.fechaVencimientoDisplay ||
                      values?.fechaVencimiento ||
                      "N/A"
                    }
                    readOnly
                  />
                ) : (
                  <input
                    type="date"
                    name="fechaVencimiento"
                    className={inputClass("fechaVencimiento")}
                    value={values?.fechaVencimiento || ""}
                    onChange={handle}
                  />
                )}
                {errors.fechaVencimiento && (
                  <div className="invalid-feedback d-block">
                    {errors.fechaVencimiento}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Derecha */}
          <div className="col-12 col-lg-6">
            <div className="border rounded-3 p-3 h-100 d-flex flex-column">
              <h6 className="mb-3">Detalle</h6>

              {/* Cantidad */}
              <div className="mb-3">
                <label className="form-label">Cantidad</label>
                {soloInfo ? (
                  <input
                    type="text"
                    className="form-control"
                    value={Number(values?.cantidad ?? 0)}
                    readOnly
                  />
                ) : (
                  <input
                    type="number"
                    name="cantidad"
                    className={inputClass("cantidad")}
                    value={values?.cantidad ?? ""}
                    onChange={handle}
                    placeholder={
                      esCrear
                        ? "0 (obligatorio, > 0)"
                        : "opcional (se sumará al stock)"
                    }
                    min={esCrear ? 1 : undefined}
                  />
                )}
                {errors.cantidad && (
                  <div className="invalid-feedback d-block">
                    {errors.cantidad}
                  </div>
                )}
                {!soloInfo && (
                  <small className="text-muted">
                    {esCrear
                      ? "Cantidad inicial para este producto en el lote."
                      : "Opcional: si ingresas un número, se SUMA al stock actual."}
                  </small>
                )}
              </div>

              <div className="mt-auto">
                <small className="text-muted">
                  Revise los datos del lote {soloInfo ? "del producto." : "antes de guardar."}
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="card-footer d-flex justify-content-between">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onAtras}
          disabled={loading}
        >
          Atrás
        </button>

        {!soloInfo && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGuardar}
            disabled={loading}
          >
            {loading ? "Guardando..." : esCrear ? "Guardar Producto" : "Guardar cambios"}
          </button>
        )}
      </div>
    </div>
  );
}
