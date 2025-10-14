// src/components/modalvendedor/ModalGenerarCobro.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import { confirmarAccion } from "../../utils/confirmations";
import { toast } from "react-toastify";

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const ModalGenerarCobro = ({ visible, onClose, pedido, onGenerarTicket }) => {
  console.log(
    "[Modal] render visible =",
    visible,
    " items en pedido =",
    Array.isArray(pedido) ? pedido.length : 0
  );

  const [dineroRecibido, setDineroRecibido] = useState("");
  const [estadoPago, setEstadoPago] = useState(null); // "faltante" | "ok" | null
  const [faltante, setFaltante] = useState(0);
  const [cambio, setCambio] = useState(0);
  const [sending, setSending] = useState(false);

  // ✅ Totales: usa precio_unitario si existe, o precio
  const subtotal = pedido.reduce(
    (acc, item) =>
      acc +
      Number(item.precio_unitario ?? item.precio ?? 0) *
        Number(item.cantidad ?? 0),
    0
  );
  const total = subtotal;

  console.log("[Modal] totales => subtotal =", subtotal, " total =", total);

  useEffect(() => {
    console.log("[Modal] mounted");
    return () => {
      console.log("[Modal] unmounted");
    };
  }, []);

  useEffect(() => {
    console.log("[Modal] visible cambió =>", visible);
  }, [visible]);

  // ✅ Validar pago en tiempo real
  useEffect(() => {
    console.log("[Modal] dineroRecibido cambio =>", dineroRecibido, " total =", total);
    if (dineroRecibido === "" || isNaN(dineroRecibido)) {
      setEstadoPago(null);
      console.log("[Modal] estadoPago => null (sin monto válido)");
      return;
    }
    const recibido = parseFloat(dineroRecibido);
    if (recibido < total) {
      setEstadoPago("faltante");
      const f = (total - recibido).toFixed(2);
      setFaltante(f);
      setCambio(0);
      console.log("[Modal] estadoPago => faltante; faltan =", f);
    } else {
      setEstadoPago("ok");
      const c = (recibido - total).toFixed(2);
      setCambio(c);
      setFaltante(0);
      console.log("[Modal] estadoPago => ok; cambio =", c);
    }
  }, [dineroRecibido, total]);

  const handleGenerarTicket = async () => {
    console.log("[Modal] botón Generar Ticket click; estadoPago =", estadoPago);
    if (estadoPago !== "ok" || sending) {
      console.log("[Modal] abortado: estadoPago !== 'ok' o ya enviando");
      return;
    }

    console.log("[Modal] abriendo confirmación…");
    await confirmarAccion({
      title: "¿Desea generar el ticket?",
      text: "Se procesará la venta y se generará el comprobante.",
      confirmButtonText: "Sí, generar",
      onConfirm: async () => {
        console.log("[Modal] onConfirm OK");
        const userLocal = localStorage.getItem("userData");
        const userSession = sessionStorage.getItem("userData");
        let usuario_id;
        try {
          usuario_id =
            (userLocal ? JSON.parse(userLocal)?.id : undefined) ??
            (userSession ? JSON.parse(userSession)?.id : undefined);
        } catch (e) {
          console.error("[Modal] error parseando userData:", e);
        }
        console.log("[Modal] usuario_id =", usuario_id);

        try {
          setSending(true);

          // 1️⃣ Verificar caja abierta
          console.log("[Modal] GET /api/cajas/estado …");
          const { data } = await axios.get(`${API_BASE}/api/cajas/estado`, {
            params: { usuario_id },
            timeout: 15000,
          });
          console.log("[Modal] respuesta /api/cajas/estado =", data);

          if (!data?.abierta) {
            const msg = data?.message || "❌ No tienes ninguna caja abierta.";
            console.warn("[Modal] caja no abierta:", msg);
            toast.error(msg);
            setSending(false);
            return;
          }

          // 2️⃣ Determinar ID de caja
          const caja_id =
            data?.datos?.CAJA_ID ??
            data?.datos?.ID_CAJA ??
            data?.datos?.id_caja ??
            data?.datos?.caja_id;
          console.log("[Modal] caja_id =", caja_id);

          // 3️⃣ Crear payload
          const payloadCarrito = pedido.map((item) => {
            const precio_unitario = Number(
              item.precio_unitario ?? item.precio ?? 0
            );
            const base = {
              cantidad: Number(item.cantidad),
              precio_unitario,
            };
            if (String(item?.tipo || "").toUpperCase() === "COMBO") {
              return { ...base, combo_id: Number(item.id) };
            }
            return { ...base, producto_id: Number(item.id) };
          });

          const body = {
            usuario_id,
            caja_id,
            dinero_recibido: parseFloat(dineroRecibido),
            cambio: parseFloat(cambio),
            carrito: payloadCarrito,
          };

          console.log("[Modal] payload POST /api/personal-ventas/procesar =>", body);

          console.time("[Modal] POST /api/personal-ventas/procesar");
          const res = await axios.post(
            `${API_BASE}/api/personal-ventas/procesar`,
            body,
            {
              headers: { "Content-Type": "application/json" },
              timeout: 20000,
              validateStatus: () => true,
            }
          );
          console.timeEnd("[Modal] POST /api/personal-ventas/procesar");
          console.log(
            "[Modal] respuesta /api/personal-ventas/procesar =>",
            res.status,
            res.data
          );

          if (res.status >= 400) {
            const msg =
              res?.data?.message ||
              `Error ${res.status} procesando la venta (backend).`;
            toast.error(msg);
            setSending(false);
            return;
          }

          // 4️⃣ Notificar al padre
          try {
            onGenerarTicket?.(res.data);
            console.log("[Modal] onGenerarTicket invocado.");
          } catch (cbErr) {
            console.error("[Modal] error en onGenerarTicket:", cbErr);
          }

          // 5️⃣ Abrir PDF del ticket
          const idVenta =
            res.data?.venta?.ID_VENTA ||
            res.data?.venta?.id_venta ||
            res.data?.id_venta;
          console.log("[Modal] idVenta obtenido =", idVenta);

          if (idVenta) {
            const url = `${API_BASE}/api/ticket-pdf/${idVenta}`;
            console.log("[Modal] abriendo ventana PDF:", url);
            window.open(url, "_blank");
          } else {
            console.error("[Modal] No se pudo obtener el ID de la venta.");
            toast.warn(
              "Venta creada, pero no se pudo abrir el ticket (ID no encontrado)."
            );
          }

          // 6️⃣ Limpiar y cerrar
          setDineroRecibido("");
          console.log("[Modal] cerrando modal…");
          onClose();
        } catch (error) {
          const msg =
            error?.response?.data?.message ||
            error?.message ||
            "Error procesando la venta";
          console.error("[Modal] catch procesando venta:", error);
          toast.error(msg);
        } finally {
          setSending(false);
        }
      },
    });
  };

  if (!visible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-contenido">
        <h2 className="titulo-modal">💳 Procesar Venta</h2>

        {/* Resumen del pedido estilo ticket */}
        <div className="resumen-pedido">
          <h4>Resumen del Pedido:</h4>

          <div className="resumen-item resumen-head" aria-hidden="true">
            <span className="descripcion"><strong>Descripción</strong></span>
            <span className="cantidad"><strong>Cantidad</strong></span>
            <span className="precio"><strong>Precio</strong></span>
            <span className="subtotal"><strong>Subtotal</strong></span>
          </div>

          {pedido.map((item) => (
            <div key={item.id} className="resumen-item">
              <span className="descripcion">
                {item.nombre}
                {String(item?.tipo || "").toUpperCase() === "COMBO" ? " (Combo)" : ""}
              </span>
              <span className="cantidad">{Number(item.cantidad ?? 0)}</span>
              <span className="precio">
                Q{Number(item.precio_unitario ?? item.precio ?? 0).toFixed(2)}
              </span>
              <span className="subtotal">
                Q{(
                  Number(item.precio_unitario ?? item.precio ?? 0) *
                  Number(item.cantidad ?? 0)
                ).toFixed(2)}
              </span>
            </div>
          ))}

          <hr />
          <p className="total">
            TOTAL: <span>Q{total.toFixed(2)}</span>
          </p>
        </div>

        {/* Ingreso de dinero */}
        <div className="dinero-recibido">
          <label>Dinero Recibido:</label>
          <input
            type="number"
            placeholder="Q0.00"
            value={dineroRecibido}
            onChange={(e) => {
              console.log("[Modal] input dineroRecibido =>", e.target.value);
              setDineroRecibido(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && estadoPago === "ok" && !sending) {
                console.log("[Modal] Enter presionado y estadoPago=ok -> generar ticket");
                handleGenerarTicket();
              }
            }}
          />
        </div>

        {/* Estado del pago */}
        {estadoPago === "faltante" && (
          <div className="alerta alerta-error">
            ❌ Dinero insuficiente: Faltan Q{faltante}
          </div>
        )}
        {estadoPago === "ok" && (
          <div className="alerta alerta-ok">Cambio a entregar: Q{cambio}</div>
        )}

        {/* Acciones */}
        <div className="acciones">
          <button
            className="btn-generar"
            disabled={estadoPago !== "ok" || sending}
            onClick={handleGenerarTicket}
          >
            {sending ? "Procesando…" : "Generar Ticket"}
          </button>
          <button
            className="btn-cancelar"
            onClick={() => {
              console.log("[Modal] click Cancelar");
              onClose();
            }}
            disabled={sending}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalGenerarCobro;
