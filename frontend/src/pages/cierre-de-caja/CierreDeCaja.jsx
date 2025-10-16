import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { confirmarAccion } from "../../utils/confirmations";
import "../../styles/cierre-de-caja/cierredecaja.css";
import VerificarAdmin from "../../components/verificacion/verificarAdmin";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const CierredeCaja = () => {
  const [denominaciones, setDenominaciones] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [observaciones, setObservaciones] = useState("");
  const [cajaAbierta, setCajaAbierta] = useState(null); // ✅ ahora objeto
  const [infoCierre, setInfoCierre] = useState({
    fecha_cierre: "",
    hora_cierre: "",
    rol_usuario: "",
    nombre_caja: "",
    monto_apertura: 0,
    total_ventas: 0,
    monto_esperado: 0,
    id_apertura: null,
  });
  const [errorCaja, setErrorCaja] = useState("");
  const [loading, setLoading] = useState(true);

  // 🔹 Modal y payload pendiente
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [payloadCierrePendiente, setPayloadCierrePendiente] = useState(null);

  // ========= Helpers para verificar admin por BD (sin JWT) =========
  const candidates = [
    "/api/auth/verify-admin",
    "/api/empleados/verify-admin",
    "/api/admin/verify",
  ];

  const normalizeAdmin = (raw) => {
    if (!raw) return null;
    const a = raw.admin || raw.user || raw.usuario || raw;
    return {
      id: a?.id || a?.ID || a?.id_usuario || a?.ID_USUARIO || null,
      usuario: a?.usuario || a?.USERNAME || a?.name || a?.NAME || "",
      rol: a?.rol || a?.role || a?.ROL || a?.ROLE || "",
      role_id: a?.role_id || a?.ROL_ID || a?.id_rol || null,
      ...a,
    };
  };

  const tryVerifyAdminById = async (userId) => {
    try {
      if (!userId) return null;
      const payload = { user_id: userId }; // el backend valida en USUARIOS/ROLES
      for (const path of candidates) {
        try {
          const { data } = await axios.post(`${API_BASE}${path}`, payload, {
            headers: { "Content-Type": "application/json" },
          });
          const ok =
            data?.ok === true ||
            data?.success === true ||
            !!data?.admin ||
            !!data?.user ||
            !!data?.usuario;
          if (ok) return normalizeAdmin(data);
        } catch {
          // probar con el siguiente endpoint candidato
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  // ========= Cargar denominaciones y caja abierta =========
  useEffect(() => {
    const fetchData = async () => {
      try {
        const userData =
          JSON.parse(localStorage.getItem("userData")) ||
          JSON.parse(sessionStorage.getItem("userData"));

        if (!userData?.id) return;

        // Denominaciones
        try {
          const resDenoms = await axios.get(`${API_BASE}/api/ventas/denominaciones`);
          const inicial = {};
          resDenoms.data.forEach((d) => {
            inicial[d.ID_DENOMINACION || d.id_denominacion] = 0;
          });
          setCantidades(inicial);
          setDenominaciones(resDenoms.data);
        } catch (err) {
          console.error("❌ Error al cargar denominaciones:", err);
          toast.error("❌ Error al cargar denominaciones");
        }

        // Caja abierta
        try {
          const resCaja = await axios.get(`${API_BASE}/api/cierredelascajas/cajas-abiertas`, {
            params: { usuario_id: userData.id },
          });
          setCajaAbierta(resCaja.data || null); // objeto con { id_apertura, nombre_caja, ... }
        } catch (err) {
          console.error("❌ Error al cargar caja abierta:", err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ========= UI / Cálculos =========
  const handleCajaSelect = async (id_apertura) => {
    if (!id_apertura) {
      setInfoCierre({
        fecha_cierre: "",
        hora_cierre: "",
        rol_usuario: "",
        nombre_caja: "",
        monto_apertura: 0,
        total_ventas: 0,
        monto_esperado: 0,
        id_apertura: null,
      });
      return;
    }

    try {
      const userData =
        JSON.parse(localStorage.getItem("userData")) ||
        JSON.parse(sessionStorage.getItem("userData"));

      const res = await axios.get(`${API_BASE}/api/cierredelascajas/info`, {
        params: { usuario_id: userData.id, id_apertura },
      });

      if (res.data.abierta) {
        setInfoCierre({
          fecha_cierre: res.data.fecha_cierre,
          hora_cierre: res.data.hora_cierre,
          rol_usuario: res.data.rol_usuario,
          nombre_caja: res.data.nombre_caja,
          monto_apertura: res.data.monto_apertura,
          total_ventas: res.data.total_ventas,
          monto_esperado: res.data.monto_esperado,
          id_apertura: res.data.id_apertura,
        });
        setErrorCaja("");
      }
    } catch (error) {
      console.error("❌ Error al cargar info de caja:", error);
      toast.error("❌ No se pudo cargar la información de la caja");
    }
  };

  const handleCantidadChange = (id, value) => {
    setCantidades((prev) => ({
      ...prev,
      [id]: parseInt(value) >= 0 ? parseInt(value) : 0,
    }));
  };

  const calcularSubtotal = (id, valor) => {
    const cantidad = cantidades[id] || 0;
    return cantidad * valor;
  };

  const totalContado = denominaciones.reduce(
    (acc, d) =>
      acc +
      calcularSubtotal(d.ID_DENOMINACION || d.id_denominacion, d.VALOR || d.valor),
    0
  );

  // ========= Cerrar caja (confirmación → fast-path admin → modal si hace falta → POST real) =========
  const handleCerrarCaja = async () => {
    const userData =
      JSON.parse(localStorage.getItem("userData")) ||
      JSON.parse(sessionStorage.getItem("userData"));

    if (!infoCierre.id_apertura) {
      setErrorCaja("Debe seleccionar una caja antes de continuar");
      return;
    }
    setErrorCaja("");

    const denominacionesArray = Object.entries(cantidades).map(([id, cantidad]) => ({
      denominacion_id: parseInt(id),
      cantidad,
    }));

    const totalCantidad = denominacionesArray.reduce((acc, d) => acc + d.cantidad, 0);
    if (totalCantidad === 0) {
      toast.error("❌ Debe ingresar denominaciones");
      return;
    }

    if (totalContado < infoCierre.monto_esperado) {
      toast.error(
        `❌ No cuadra el cierre. Faltan Q${(infoCierre.monto_esperado - totalContado).toFixed(2)}`
      );
      return;
    }

    if (totalContado > infoCierre.monto_esperado && !observaciones.trim()) {
      toast.error("❌ Debe ingresar observaciones cuando sobra dinero en caja");
      return;
    }

    confirmarAccion({
      title: "¿Desea cerrar la caja?",
      text: `Se cerrará la caja con Q${totalContado}.`,
      confirmButtonText: "Sí, cerrar",
      onConfirm: async () => {
        // Guardar payload
        setPayloadCierrePendiente({
          usuario_id: userData.id,
          apertura_id: infoCierre.id_apertura,
          observaciones: observaciones || null,
          denominaciones: denominacionesArray,
        });

        // FAST-PATH: consultar a BD si el usuario actual ya es admin activo
        const adminInfo = await tryVerifyAdminById(userData.id);
        if (adminInfo?.id) {
          // Auto-autoriza sin pedir contraseña
          await onAdminConfirmado(adminInfo);
        } else {
          // No admin → mostrar modal para credenciales
          setShowAdminModal(true);
        }
      },
    });
  };

  // Cuando el admin se verifica (fast-path o modal), enviar el cierre
  const onAdminConfirmado = async (adminInfo) => {
    setShowAdminModal(false);
    if (!payloadCierrePendiente) return;

    try {
      const res = await axios.post(`${API_BASE}/api/registrar-cierre`, {
        ...payloadCierrePendiente,
        admin_id: adminInfo?.id || null, // quién autorizó
      });

      // ✅ Sólo número de ticket si viene; si no, message; si no, nada.
      const ticket = res.data?.numero_ticket;
      if (ticket) {
        toast.success(`Ticket ${ticket}`);
      } else if (res.data?.message) {
        toast.success(res.data.message || "✅ Caja cerrada correctamente");
      }

      // Abrir PDF de CORTE automáticamente
      if (res.data.cierre_id) {
        window.open(`${API_BASE}/api/pdf/corte-caja/${res.data.cierre_id}`, "_blank");
      }

      // Reset UI
      setObservaciones("");
      const resetCant = {};
      denominaciones.forEach((d) => {
        resetCant[d.ID_DENOMINACION || d.id_denominacion] = 0;
      });
      setCantidades(resetCant);

      setInfoCierre({
        fecha_cierre: "",
        hora_cierre: "",
        rol_usuario: "",
        nombre_caja: "",
        monto_apertura: 0,
        total_ventas: 0,
        monto_esperado: 0,
        id_apertura: null,
      });

      setCajaAbierta(null);
      setPayloadCierrePendiente(null);
    } catch (error) {
      console.error("❌ Error al cerrar caja:", error);
      const msg = error.response?.data?.message || "❌ No se pudo cerrar la caja";
      toast.error(msg);
    }
  };

  return (
    <div className="cierre-container">
      {loading ? (
        <div className="loading">Cargando información...</div>
      ) : (
        <>
          {/* 🔹 Datos */}
          <div className="info-row">
            <div className="info-card">
              <label>FECHA DE CIERRE</label>
              <input type="text" value={infoCierre.fecha_cierre} disabled />
            </div>
            <div className="info-card">
              <label>HORA DE CIERRE</label>
              <input type="text" value={infoCierre.hora_cierre} disabled />
            </div>
            <div className="info-card">
              <label>ROL DEL USUARIO</label>
              <input type="text" value={infoCierre.rol_usuario} disabled />
            </div>
            <div className="info-card">
              <label>NÚMERO DE CAJA</label>
              <select
                value={infoCierre.id_apertura || ""}
                onChange={(e) => handleCajaSelect(e.target.value)}
              >
                <option value="">-- Seleccione Caja --</option>
                {cajaAbierta && (
                  <option value={cajaAbierta.id_apertura}>
                    {cajaAbierta.nombre_caja}
                  </option>
                )}
              </select>
              {errorCaja && <p className="error-text">{errorCaja}</p>}
            </div>
          </div>

          {/* 🔹 Totales */}
          <div className="totales-row">
            <div className="total-card apertura">
              <p>Monto de Apertura</p>
              <h3>Q{infoCierre.monto_apertura.toFixed(2)}</h3>
            </div>
            <div className="total-card ventas">
              <p>Total en Ventas</p>
              <h3>Q{infoCierre.total_ventas.toFixed(2)}</h3>
            </div>
            <div className="total-card debe-haber">
              <p>Dinero que Debe Haber</p>
              <h3>Q{infoCierre.monto_esperado.toFixed(2)}</h3>
            </div>
          </div>

          {/* 🔹 Observaciones */}
          <div className="form-group observaciones">
            <label>Observaciones</label>
            <textarea
              rows="2"
              className="form-control"
              placeholder="Ingrese observaciones (opcional)"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          {/* 🔹 Tabla denominaciones */}
          <div className="tabla-container">
            <table>
              <thead>
                <tr>
                  <th>Denominación</th>
                  <th>Cantidad</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {denominaciones.map((d) => {
                  const id = d.ID_DENOMINACION || d.id_denominacion;
                  const valor = d.VALOR || d.valor;
                  return (
                    <tr key={id}>
                      <td>Q{valor}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={cantidades[id] || 0}
                          onChange={(e) => handleCantidadChange(id, e.target.value)}
                        />
                      </td>
                      <td>Q{calcularSubtotal(id, valor).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 🔹 Total contado */}
            <div className="total-contado">
              <span>Total Contado:</span>
              <strong>Q{totalContado.toFixed(2)}</strong>
            </div>
          </div>

          {/* 🔹 Botón cerrar */}
          <div className="boton-cierre">
            <button onClick={handleCerrarCaja}>Cerrar Caja</button>
          </div>

          {/* 🔒 Modal de verificación de Administrador (silenciado) */}
          <VerificarAdmin
            open={showAdminModal}
            onClose={() => setShowAdminModal(false)}
            onSuccess={onAdminConfirmado}
            quiet
          />
        </>
      )}
    </div>
  );
};

export default CierredeCaja;
