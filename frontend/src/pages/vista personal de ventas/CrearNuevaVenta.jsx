// src/views/personal-ventas/CrearNuevaVenta.jsx
import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import "../../styles/personal de ventas/crearNuevaVenta.css";
import ModalGenerarCobro from "../../components/modalvendedor/ModalGenerarCobro";
import { toast } from "react-toastify";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

/* ---------- Helpers ---------- */
const toNumberSafe = (v, def = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

// Normaliza una URL: si es relativa "/api/..." la convierte a absoluta con API_BASE
const abs = (u) => {
  if (!u || typeof u !== "string") return u;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
};

// Resuelve src de imagen para productos/combos en esta vista
const imgSrcProducto = (p) => {
  const id = p?.id ?? p?.ID;
  const raw = p?.imagen || p?.imagen_url || p?.IMAGEN_URL || null;
  if (raw) return abs(raw);
  return id ? `${API_BASE}/api/productos/${id}/imagen` : null;
};

const imgSrcCombo = (c) => {
  const id = c?.id ?? c?.ID;
  const raw = c?.imagen || c?.imagen_url || c?.IMAGEN_URL || null;
  if (raw) return abs(raw);
  return id ? `${API_BASE}/api/combos/${id}/imagen` : null;
};

/* ---------- Pills de categorías ---------- */
function CategoryPills({ categories, value, onChange }) {
  const items = [
    { ID: null, NOMBRE: "Todo" },
    { ID: "__COMBOS__", NOMBRE: "Combos" },
    ...categories,
  ];
  return (
    <div className="cat-pills">
      {items.map((c) => {
        const val = c.ID === null ? "" : c.NOMBRE;
        const isActive =
          (value === "" && c.ID === null) ||
          value?.toLowerCase() === c.NOMBRE?.toLowerCase();
        return (
          <button
            key={c.ID ?? "all"}
            type="button"
            className={`cat-pill ${isActive ? "active" : ""}`}
            onClick={() => onChange(val)}
          >
            {c.NOMBRE}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Vista principal ---------- */
const CrearNuevaVenta = () => {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);

  // Datos combos
  const [categoriasCombo, setCategoriasCombo] = useState([]);
  const [combos, setCombos] = useState([]);
  const [loadingCombos, setLoadingCombos] = useState(false);

  const isCombosView = String(categoriaSeleccionada).toLowerCase() === "combos";

  /* Cargar productos */
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/personal-ventas/productos`);
        setProductos(res.data);
      } catch (error) {
        const msg =
          error?.response?.data?.message || "No se pudieron cargar los productos.";
        toast.error(msg);
      }
    })();
  }, []);

  /* Cargar categorías de productos */
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/categoria-productos`);
        setCategorias(res.data);
      } catch (error) {
        const msg =
          error?.response?.data?.message || "No se pudieron cargar las categorías.";
        toast.error(msg);
      }
    })();
  }, []);

  /* Cargar categorías de combos (silencioso) */
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/categoria-combo`);
        setCategoriasCombo(Array.isArray(res.data) ? res.data : []);
      } catch {
        setCategoriasCombo([]);
      }
    })();
  }, []);

  /* Cargar combos con texto de búsqueda */
  useEffect(() => {
    if (!isCombosView) return;

    let cancel;
    const timer = setTimeout(async () => {
      try {
        setLoadingCombos(true);
        const { data } = await axios.get(`${API_BASE}/api/combos/buscar`, {
          params: { q: busqueda.trim() },
          cancelToken: new axios.CancelToken((c) => (cancel = c)),
        });
        const list = Array.isArray(data) ? data : [];
        const norm = list
          .filter((c) => Number(c.estado ?? c.ESTADO_ID ?? 1) === 1)
          .map((c) => {
            const precio = toNumberSafe(
              c.precio ?? c.precioVenta ?? c.PRECIO_VENTA
            );
            const cant = toNumberSafe(
              c.cantidadDisponible ?? c.CANTIDAD_DISPONIBLE,
              0
            );
            return {
              id: c.id ?? c.ID,
              nombre: c.nombre ?? c.NOMBRE ?? "",
              descripcion: c.descripcion ?? c.DESCRIPCION ?? "",
              precio,
              imagen: c.imagen ?? c.IMAGEN ?? null,
              cantidadDisponible: cant,
              cantidadDisponibleTexto:
                c.cantidadDisponibleTexto ?? `cantidad disponible : ${cant}`,
            };
          });
        setCombos(norm);
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error("❌ Error buscando combos:", err);
          setCombos([]);
        }
      } finally {
        setLoadingCombos(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (cancel) cancel();
    };
  }, [isCombosView, busqueda]);

  /* Filtro por búsqueda + categoría (PRODUCTOS) */
  const productosFiltrados = useMemo(() => {
    if (isCombosView) return [];
    return productos.filter((p) => {
      const coincideBusqueda = (p.nombre || "")
        .toLowerCase()
        .includes(busqueda.toLowerCase());
      const coincideCategoria =
        !categoriaSeleccionada ||
        String(categoriaSeleccionada).toLowerCase() === "todo" ||
        (p.categoriaNombre &&
          p.categoriaNombre.toLowerCase() ===
            categoriaSeleccionada.toLowerCase());
      return coincideBusqueda && coincideCategoria;
    });
  }, [productos, busqueda, categoriaSeleccionada, isCombosView]);

  /* Agregar al carrito (producto o combo) */
  const agregarAlCarrito = (item, esCombo = false) => {
    if (!esCombo) {
      const estado = (item.estado || "").toUpperCase();
      const sinStock = Number(item.cantidad) <= 0;
      const bloqueado =
        sinStock || estado === "BLOQUEADO" || estado === "VENCIDO";

      if (bloqueado) {
        const msg =
          estado === "VENCIDO"
            ? "❌ Producto vencido - no disponible"
            : estado === "BLOQUEADO"
            ? "❌ Producto no disponible"
            : "❌ No hay existencias para este producto.";
        toast.error(msg);
        return;
      }

      setCarrito((prev) => {
        const existe = prev.find((i) => i.id === item.id && i.tipo !== "COMBO");
        if (existe) {
          return prev.map((i) =>
            i.id === item.id && i.tipo !== "COMBO"
              ? { ...i, cantidad: i.cantidad + 1 }
              : i
          );
        }
        return [
          ...prev,
          { ...item, cantidad: 1, precio_unitario: Number(item.precio) },
        ];
      });
      return;
    }

    // es combo
    const disponible = Number(item.cantidadDisponible ?? 0);
    if (disponible <= 0) {
      toast.error("❌ No hay existencias para este combo.");
      return;
    }

    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === item.id && i.tipo === "COMBO");
      if (existe) {
        const next = existe.cantidad + 1;
        if (next > disponible) {
          toast.error(
            `❌ Stock insuficiente para ${item.nombre}. Disponible: ${disponible}, solicitado: ${next}`
          );
          return prev;
        }
        return prev.map((i) =>
          i.id === item.id && i.tipo === "COMBO"
            ? { ...i, cantidad: next }
            : i
        );
      }
      return [
        ...prev,
        {
          ...item,
          tipo: "COMBO",
          cantidad: 1,
          precio_unitario: Number(item.precio),
        },
      ];
    });
  };

  /* Cambiar cantidad (+/-) con validación de stock */
  const cambiarCantidad = async (id, delta) => {
    const itemCarrito = carrito.find((i) => i.id === id);
    if (!itemCarrito) return;

    if (delta > 0) {
      try {
        if (itemCarrito.tipo === "COMBO") {
          const res = await axios.get(`${API_BASE}/api/combos/${id}`);
          const cant = toNumberSafe(
            res?.data?.cantidadDisponible ?? res?.data?.CANTIDAD_DISPONIBLE,
            0
          );
          const nuevaCantidad = (itemCarrito?.cantidad || 0) + 1;
          if (nuevaCantidad > cant) {
            toast.error(
              `❌ Stock insuficiente para ${itemCarrito.nombre}. Disponible: ${cant}, solicitado: ${nuevaCantidad}`
            );
            return;
          }
        } else {
          const res = await axios.get(
            `${API_BASE}/api/personal-ventas/producto/${id}`
          );
          const disponible = Number(res?.data?.cantidad ?? 0);
          const nombre = res?.data?.nombre || "este producto";
          const nuevaCantidad = (itemCarrito?.cantidad || 0) + 1;
          if (nuevaCantidad > disponible) {
            toast.error(
              `❌ Stock insuficiente para ${nombre}. Disponible: ${disponible}, solicitado: ${
                nuevaCantidad - (itemCarrito?.cantidad || 0)
              }`
            );
            return;
          }
        }
      } catch (err) {
        const msg =
          err?.response?.data?.message || "Error validando stock en backend.";
        toast.error(msg);
        return;
      }
    }

    setCarrito((prev) =>
      prev
        .map((i) =>
          i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i
        )
        .filter((i) => i.cantidad > 0)
    );
  };

  const quitarProducto = (id) => {
    setCarrito((prev) => prev.filter((i) => i.id !== id));
  };

  const subtotal = carrito.reduce(
    (acc, i) => acc + Number(i.precio_unitario ?? i.precio ?? 0) * i.cantidad,
    0
  );
  const total = subtotal;

  /* Validación final antes de cobrar */
  const validarStockAntesDeProcesar = async () => {
    try {
      for (const item of carrito) {
        if (item.tipo === "COMBO") {
          const res = await axios.get(`${API_BASE}/api/combos/${item.id}`);
          const disp = toNumberSafe(
            res?.data?.cantidadDisponible ?? res?.data?.CANTIDAD_DISPONIBLE,
            0
          );
          if (item.cantidad > disp) {
            toast.error(
              `❌ Stock insuficiente para ${item.nombre}. Disponible: ${disp}, solicitado: ${item.cantidad}`
            );
            return;
          }
        } else {
          const res = await axios.get(
            `${API_BASE}/api/personal-ventas/producto/${item.id}`
          );
          const p = res.data;
          const disponible = Number(p?.cantidad ?? 0);
          const nombre = p?.nombre || item.nombre;
          if (item.cantidad > disponible) {
            toast.error(
              `❌ Stock insuficiente para ${nombre}. Disponible: ${disponible}, solicitado: ${item.cantidad}`
            );
            return;
          }
        }
      }
      setMostrarModal(true);
    } catch (err) {
      const msg =
        err?.response?.data?.message || "Error validando stock en backend.";
      toast.error(msg);
    }
  };

  /* Manejo del resultado del modal (POST /ventas) */
  const handleGenerarTicket = (datosVenta) => {
    try {
      const codigo =
        datosVenta?.venta?.CODIGO_TICKET ||
        datosVenta?.venta?.codigo_ticket ||
        datosVenta?.codigo_ticket ||
        "";
      if (codigo) {
        toast.success(`Venta ${codigo} generada correctamente.`);
      } else {
        toast.success("Venta generada correctamente.");
      }
    } catch {
      toast.success("Venta generada correctamente.");
    }
    setCarrito([]);
  };

  return (
    <div className="venta-container">
      {/* Izquierda: Productos o Combos */}
      <div className="productos-section">
        <div className="filtros">
          <input
            type="text"
            placeholder={isCombosView ? "Buscar combo..." : "Buscar producto..."}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="input-busqueda"
          />
          <CategoryPills
            categories={categorias}
            value={categoriaSeleccionada}
            onChange={setCategoriaSeleccionada}
          />
        </div>

        <div className="productos-grid">
          {isCombosView ? (
            <>
              {loadingCombos ? (
                <div className="mensaje-vacio">Cargando combos…</div>
              ) : combos.length === 0 ? (
                <div className="mensaje-vacio">No hay combos registrados</div>
              ) : (
                combos.map((c) => (
                  <div
                    key={c.id}
                    className="producto-card"
                    onClick={() =>
                      agregarAlCarrito(
                        {
                          id: c.id,
                          nombre: c.nombre,
                          imagen: c.imagen,
                          precio: c.precio,
                          cantidadDisponible: c.cantidadDisponible,
                          cantidadDisponibleTexto: c.cantidadDisponibleTexto,
                          tipo: "COMBO",
                        },
                        true
                      )
                    }
                    title="Agregar combo al carrito"
                  >
                    <div className="producto-imagen">
                      {imgSrcCombo(c) ? (
                        <img src={imgSrcCombo(c)} alt={c.nombre} />
                      ) : (
                        "🧺"
                      )}
                    </div>
                    <h4>{c.nombre}</h4>
                    <p className="precio">
                      Q{Number(c.precio || 0).toFixed(2)}
                    </p>
                    {c.descripcion && (
                      <p className="detalle">{c.descripcion}</p>
                    )}
                    <p className="detalle">{c.cantidadDisponibleTexto}</p>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              {productosFiltrados.length === 0 ? (
                <div className="mensaje-vacio">
                  {categoriaSeleccionada &&
                  categoriaSeleccionada.toLowerCase() !== "todo"
                    ? `No hay productos en la categoría "${categoriaSeleccionada}"`
                    : "No se encontraron productos"}
                </div>
              ) : (
                productosFiltrados.map((p) => {
                  const estado = (p.estado || "").toUpperCase();
                  const sinStock = Number(p.cantidad) <= 0;
                  const isDisabled =
                    sinStock || estado === "BLOQUEADO" || estado === "VENCIDO";

                  let badgeText = "";
                  if (sinStock) badgeText = "Sin stock";
                  else if (estado === "BLOQUEADO") badgeText = "Bloqueado";
                  else if (estado === "VENCIDO") badgeText = "Vencido";
                  else if (estado === "POR_VENCER") badgeText = "Por vencer";
                  else if (estado === "STOCK_BAJO") badgeText = "Stock bajo";

                  const badgeClass =
                    sinStock || estado === "BLOQUEADO" || estado === "VENCIDO"
                      ? "badge-danger"
                      : estado === "POR_VENCER" || estado === "STOCK_BAJO"
                      ? "badge-warning"
                      : "badge-neutral";

                  return (
                    <div
                      key={p.id}
                      className={`producto-card ${isDisabled ? "disabled" : ""}`}
                      onClick={() => !isDisabled && agregarAlCarrito(p)}
                      title={
                        isDisabled
                          ? "No disponible para la venta"
                          : "Agregar al carrito"
                      }
                    >
                      {badgeText && (
                        <span className={`estado-badge ${badgeClass}`}>
                          {badgeText}
                        </span>
                      )}

                      <div className="producto-imagen">
                        {imgSrcProducto(p) ? (
                          <img src={imgSrcProducto(p)} alt={p.nombre} />
                        ) : (
                          "📦"
                        )}
                      </div>

                      <h4>{p.nombre}</h4>
                      <p className="precio">
                        Q{Number(p.precio || 0).toFixed(2)}
                      </p>
                      <p className="detalle">
                        Unidad: {p.unidad_medida} | Cantidad: {p.cantidad}
                      </p>
                      <p className="detalle">Vence: {p.fecha_vencimiento}</p>

                      {p.alerta && !badgeText && (
                        <p className="alerta texto-suave">{p.alerta}</p>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* Derecha: Carrito */}
      <div className="carrito-section">
        <h3 className="titulo-carrito">Productos</h3>

        {carrito.length === 0 ? (
          <p className="vacio">No hay productos seleccionados</p>
        ) : (
          <div className="lista-carrito">
            {carrito.map((item) => (
              <div key={item.id} className="carrito-item">
                <span>
                  {item.imagen && (
                    <img
                      src={abs(item.imagen)}
                      alt={item.nombre}
                      style={{ width: 25, marginRight: 6 }}
                    />
                  )}
                  {item.nombre} {item.tipo === "COMBO" ? " (Combo)" : ""}
                </span>
                <span className="precio-unitario">
                  Q{Number(item.precio_unitario ?? item.precio).toFixed(2)} c/u
                </span>

                <div className="controles">
                  <button onClick={() => cambiarCantidad(item.id, -1)}>-</button>
                  <span>{item.cantidad}</span>
                  <button onClick={() => cambiarCantidad(item.id, 1)}>+</button>
                  <button
                    className="btn-quitar"
                    onClick={() => quitarProducto(item.id)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="resumen">
          <p>
            Subtotal: <span>Q{subtotal.toFixed(2)}</span>
          </p>
          <p className="total">
            Total: <span>Q{total.toFixed(2)}</span>
          </p>
        </div>

        <button
          className="btn-procesar"
          disabled={carrito.length === 0}
          onClick={validarStockAntesDeProcesar}
        >
          Procesar Venta
        </button>
      </div>

      {/* Modal Cobro */}
      <ModalGenerarCobro
        visible={mostrarModal}
        onClose={() => setMostrarModal(false)}
        pedido={carrito}
        onGenerarTicket={handleGenerarTicket}
      />
    </div>
  );
};

export default CrearNuevaVenta;
