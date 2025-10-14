import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { confirmarAccion } from "../../utils/confirmations"; // Confirmación SweetAlert
import { Link, useLocation } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import "../../styles/personal de ventas/aperturaCaja.css";
import VerificarAdmin from "../../components/verificacion/verificarAdmin";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const AperturaCaja = () => {
  const [caja, setCaja] = useState("");
  const [turno, setTurno] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [cajas, setCajas] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [denominaciones, setDenominaciones] = useState([]);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState({
    caja: false,
    turno: false,
    observaciones: false,
  });

  const location = useLocation();

  // 🔒 NUEVO: modal + payload pendiente
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [payloadAperturaPendiente, setPayloadAperturaPendiente] = useState(null);

  // 🔹 Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resCajas, resTurnos, resDenoms] = await Promise.all([
          axios.get(`${API_BASE}/api/ventas/cajas`),
          axios.get(`${API_BASE}/api/ventas/turnos`),
          axios.get(`${API_BASE}/api/ventas/denominaciones`),
        ]);

        setCajas(resCajas.data);
        setTurnos(resTurnos.data);
        setDenominaciones(resDenoms.data.map((d) => ({ ...d, cantidad: 0 })));
      } catch (error) {
        console.error("❌ Error cargando datos:", error);
        toast.error("Error cargando datos iniciales");
      }
    };

    fetchData();
  }, []);

  // 🔹 Manejar cantidad ingresada
  const handleCantidadChange = (index, value) => {
    const nuevas = [...denominaciones];
    const cantidad = parseInt(value) || 0;
    nuevas[index].cantidad = cantidad >= 0 ? cantidad : 0;
    setDenominaciones(nuevas);
  };

  // 🔹 Calcular total efectivo
  const totalEfectivo = denominaciones.reduce(
    (acc, d) => acc + d.cantidad * (d.VALOR || d.valor),
    0
  );

  // 🔹 Obtener usuario logueado
  const getUsuarioId = () => {
    try {
      const userData =
        JSON.parse(localStorage.getItem("userData")) ||
        JSON.parse(sessionStorage.getItem("userData"));
      return userData?.id || localStorage.getItem("usuario_id") || null;
    } catch {
      return null;
    }
  };

  // 🔹 Validaciones secuenciales
  const validarFormulario = () => {
    const nuevosErrores = { caja: false, turno: false, observaciones: false };

    if (!caja) {
      nuevosErrores.caja = true;
      setErrors(nuevosErrores);
      return false;
    }

    if (!turno) {
      nuevosErrores.turno = true;
      setErrors(nuevosErrores);
      return false;
    }

    const totalCantidad = denominaciones.reduce((acc, d) => acc + d.cantidad, 0);
    if (totalCantidad === 0) {
      toast.error("Debe ingresar denominaciones");
      setErrors(nuevosErrores);
      return false;
    }

    const faltantes = denominaciones.filter((d) => d.cantidad === 0).length;
    if (faltantes > 0 && !observaciones.trim()) {
      nuevosErrores.observaciones = true;
      setErrors(nuevosErrores);
      return false;
    }

    setErrors(nuevosErrores);
    return true;
  };

  // 🔹 Apertura de caja (mantenemos confirmación; luego pedimos admin y recién posteamos)
  const handleApertura = async () => {
    if (!validarFormulario()) return;

    const usuarioId = getUsuarioId();
    if (!usuarioId) {
      toast.error("No se pudo obtener el usuario logueado");
      return;
    }

    confirmarAccion({
      title: "¿Está seguro que desea aperturar la caja?",
      text: "Se registrará la apertura con las denominaciones ingresadas",
      confirmButtonText: "Sí, aperturar",
      onConfirm: async () => {
        // 👇 En vez de postear aquí, armamos payload y abrimos modal de admin
        const payload = {
          usuario_id: usuarioId,
          caja_id: caja,
          turno_id: turno,
          estado_id: 1,
          observaciones: observaciones.trim() || null,
          denominaciones: denominaciones.map((d) => ({
            denominacion_id: d.ID_DENOMINACION || d.id_denominacion,
            cantidad: d.cantidad,
          })),
        };
        setPayloadAperturaPendiente(payload);
        setShowAdminModal(true);
      },
    });
  };

  // 🔹 Cuando el admin verifique OK, recién enviamos la apertura con admin_id
  const onAdminConfirmado = async (adminInfo) => {
    setShowAdminModal(false);
    if (!payloadAperturaPendiente) return;

    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/ventas/apertura`,
        { ...payloadAperturaPendiente, admin_id: adminInfo?.id || null }
      );

      const ticketMsg = res.data.numero_ticket
        ? ` (Ticket ${res.data.numero_ticket})`
        : "";
      toast.success(
        res.data.message || `✅ Caja aperturada con éxito${ticketMsg}`
      );

      // Abrir PDF automáticamente
      if (res.data.apertura_id) {
        window.open(
          `${API_BASE}/api/pdf/apertura-caja/${res.data.apertura_id}`,
          "_blank"
        );
      }

      // Resetear formulario
      setCaja("");
      setTurno("");
      setObservaciones("");
      setDenominaciones(denominaciones.map((d) => ({ ...d, cantidad: 0 })));
      setErrors({ caja: false, turno: false, observaciones: false });
      setPayloadAperturaPendiente(null);
    } catch (error) {
      console.error("❌ Error al aperturar caja:", error);
      const msg =
        error.response?.data?.message || "❌ No se pudo aperturar la caja";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="apertura-container">
      {/* Aviso */}
      <div className="alert">
        <strong>Apertura de Caja:</strong> Complete todos los campos requeridos
        para iniciar las operaciones del día.
      </div>

      <div className="content">
        {/* Columna izquierda */}
        <div className="card info-general">
          <div className="card-header">Información General</div>
          <div className="card-body">
            <div className="form-group">
              <label>Número de Caja *</label>
              <select
                className={`form-select ${errors.caja ? "is-invalid" : ""}`}
                value={caja}
                onChange={(e) => setCaja(e.target.value)}
              >
                <option value="">Seleccionar caja...</option>
                {cajas.map((c) => (
                  <option key={c.ID || c.id} value={c.ID || c.id}>
                    {c.NOMBRE || c.nombre}
                  </option>
                ))}
              </select>
              {errors.caja && (
                <div className="invalid-feedback">Campo obligatorio</div>
              )}
            </div>

            <div className="form-group">
              <label>Turno *</label>
              <select
                className={`form-select ${errors.turno ? "is-invalid" : ""}`}
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
              >
                <option value="">Seleccionar turno...</option>
                {turnos.map((t) => (
                  <option key={t.ID || t.id} value={t.ID || t.id}>
                    {t.NOMBRE || t.nombre}
                  </option>
                ))}
              </select>
              {errors.turno && (
                <div className="invalid-feedback">Campo obligatorio</div>
              )}
            </div>

            <div className="form-group">
              <label>Observaciones</label>
              <textarea
                className={`form-control ${
                  errors.observaciones ? "is-invalid" : ""
                }`}
                rows="2"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ingrese motivo si falta alguna denominación..."
              />
              {errors.observaciones && (
                <div className="invalid-feedback">
                  Debe ingresar observaciones si falta alguna denominación
                </div>
              )}
            </div>

            {/* Botón Apertura */}
            <button
              className="btn-apertura"
              onClick={handleApertura}
              disabled={loading}
            >
              {loading ? "Procesando..." : "🚀 Aperturar Caja"}
            </button>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="card conteo">
          <div className="card-header">Conteo de Efectivo Inicial</div>
          <div className="card-body">
            <table className="table table-bordered text-center">
              <thead className="table-dark">
                <tr>
                  <th>Denominación</th>
                  <th>Cantidad</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {denominaciones.map((d, i) => (
                  <tr key={d.ID_DENOMINACION || d.id_denominacion || i}>
                    <td>Q{d.VALOR || d.valor}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className="form-control text-center"
                        value={d.cantidad}
                        onChange={(e) => handleCantidadChange(i, e.target.value)}
                      />
                    </td>
                    <td>
                      Q{(d.cantidad * (d.VALOR || d.valor)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="total-box">
              Total Efectivo Inicial: Q{totalEfectivo.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 🔒 Modal de verificación de Administrador */}
      <VerificarAdmin
        open={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onSuccess={onAdminConfirmado}
      />
    </div>
  );
};

export default AperturaCaja;
