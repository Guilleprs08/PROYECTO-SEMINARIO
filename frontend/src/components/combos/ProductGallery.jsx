// src/components/combos/ProductGallery.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/* =======================
   CONFIG
======================= */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

/** ID de categoría que representa "COMBOS" (si aplica en tu BD). */
const PRODUCT_CATEGORY_ID_COMBO_ALIAS = 1;

/* =======================
   HELPERS
======================= */
const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const get = (path, cfg = {}) =>
  axios.get(`${API_BASE}${path}`, {
    ...cfg,
    headers: { ...authHeaders(), ...(cfg.headers || {}) },
  });

const toNumberSafe = (v, def = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

const toAbs = (u) => {
  if (!u || typeof u !== "string") return u;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
};

const isDirectUrl = (s) =>
  typeof s === "string" &&
  s.trim() !== "" &&
  (/^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("data:"));

/** Candidatos de imagen para PRODUCTO (en orden de prueba) */
const getProductoImgCandidates = (p) => {
  const urlField =
    p?.imagenUrl ||
    p?.imagen_url ||
    p?.imagenURL ||
    p?.IMAGEN_URL ||
    p?.imagen ||
    p?.IMAGEN;

  const id = p?.id ?? p?.ID;
  const ts = `?ts=${Date.now()}`;

  const candidates = [];
  // 0) Si viene una URL directa (http, /ruta, data:), normalizar a absoluta
  if (isDirectUrl(urlField)) candidates.push(toAbs(urlField));

  if (id) {
    candidates.push(`${API_BASE}/api/productos/${encodeURIComponent(id)}/imagen${ts}`); // <-- NUEVO
    candidates.push(`${API_BASE}/api/nuevoproducto/${encodeURIComponent(id)}/imagen${ts}`);
    candidates.push(`${API_BASE}/api/pos/producto-nuevo/${encodeURIComponent(id)}/imagen${ts}`);
    candidates.push(`${API_BASE}/api/personal-ventas/productos/${encodeURIComponent(id)}/imagen${ts}`);
  }
  return candidates;
};

/** Candidatos de imagen para COMBO */
// en getComboImgCandidates => también normaliza si IMAGEN_URL viene como "/api/combos/:id/imagen"
const getComboImgCandidates = (c) => {
  const urlField = c?.imagenUrl || c?.imagen_url || c?.IMAGEN_URL || c?.imagen || c?.IMAGEN;
  const id = c?.id ?? c?.ID;
  const ts = `?ts=${Date.now()}`;

  const candidates = [];
  if (isDirectUrl(urlField)) candidates.push(toAbs(urlField));
  if (id) {
    candidates.push(`${API_BASE}/api/combos/${encodeURIComponent(id)}/imagen${ts}`);
  }
  return candidates;
};

/** Descarga secuencial con auth → blob → objectURL */
const fetchObjectUrlWithAuth = async (urls) => {
  for (const u of urls) {
    try {
      if (typeof u === "string" && u.startsWith("data:")) return u;
      const res = await axios.get(u, {
        responseType: "blob",
        headers: { ...authHeaders() },
      });
      const blobUrl = URL.createObjectURL(res.data);
      return blobUrl;
    } catch {
      // probar el siguiente
    }
  }
  return null;
};

/** Imagen que maneja endpoints protegidos por Authorization */
function SecureImage({ candidates, alt = "", className = "", style = {} }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let toRevoke = null;
    (async () => {
      const url = await fetchObjectUrlWithAuth(candidates || []);
      setSrc(url);
      toRevoke = url;
    })();
    return () => {
      if (toRevoke && toRevoke.startsWith("blob:")) URL.revokeObjectURL(toRevoke);
    };
  }, [JSON.stringify(candidates)]);

  if (!src) return <div style={{ width: "100%", height: "100%", opacity: 0.2 }} />;

  return <img src={src} alt={alt} className={className} style={style} />;
}

const mapProducto = (p) => ({
  id: p?.id ?? p?.ID,
  nombre: p?.nombre ?? p?.NOMBRE ?? "",
  precio: toNumberSafe(
    p?.precio ?? p?.precio_venta ?? p?.precioVenta ?? p?.PRECIO_VENTA
  ),
  precioVenta: toNumberSafe(
    p?.precio ?? p?.precio_venta ?? p?.precioVenta ?? p?.PRECIO_VENTA
  ),
  categoriaId:
    p?.categoria_id ??
    p?.categoriaId ??
    p?.categoria ??
    p?.CATEGORIA_ID ??
    p?.CATEGORIA ??
    null,
  categoriaNombre: p?.categoriaNombre ?? p?.CATEGORIA_NOMBRE ?? p?.categoria ?? "",
  imagen: p?.imagen ?? p?.IMAGEN ?? null,
  imagenUrl: p?.imagenUrl ?? p?.IMAGEN_URL ?? p?.imagen_url ?? null,
  estado: String(p?.estado ?? p?.ESTADO ?? "").toUpperCase(),
  cantidad: toNumberSafe(p?.cantidad ?? p?.CANTIDAD, 0),
  unidadMedida: p?.unidad_medida ?? p?.unidadMedida ?? p?.UNIDAD_MEDIDA ?? "",
  alerta: p?.alerta ?? p?.ALERTA ?? "",
  tipo: "PRODUCTO",
});

const mapCombo = (c) => {
  const precioNum = toNumberSafe(c?.precio ?? c?.precioVenta ?? c?.PRECIO_VENTA);
  const cant = toNumberSafe(c?.cantidadDisponible ?? c?.CANTIDAD_DISPONIBLE, 0);
  const cantTexto = c?.cantidadDisponibleTexto ?? `cantidad disponible : ${cant}`;
  return {
    id: c?.id ?? c?.ID,
    nombre: c?.nombre ?? c?.NOMBRE ?? "",
    descripcion: c?.descripcion ?? c?.DESCRIPCION ?? "",
    precio: precioNum,
    precioVenta: precioNum,
    imagen: c?.imagen ?? c?.IMAGEN ?? null,
    imagenUrl: c?.imagenUrl ?? c?.IMAGEN_URL ?? c?.imagen_url ?? null,
    estado: toNumberSafe(c?.estado ?? c?.estado_id ?? c?.ESTADO_ID ?? 0),
    categoriaId: c?.categoriaId ?? c?.CATEGORIA_ID ?? null,
    categoriaNombre: c?.categoriaNombre ?? c?.CATEGORIA_NOMBRE ?? "",
    fechaCreacion: c?.fechaCreacion ?? c?.FECHA_CREACION ?? null,
    cantidadDisponible: cant,
    cantidadDisponibleTexto: cantTexto,
    tipo: "COMBO",
  };
};

const badgeInfo = (p) => {
  const estado = (p.estado || "").toUpperCase();
  const sinStock = p.cantidad <= 0;
  if (sinStock) return { text: "Sin stock", cls: "badge-danger", disabled: true };
  if (estado === "BLOQUEADO") return { text: "Bloqueado", cls: "badge-danger", disabled: true };
  if (estado === "VENCIDO") return { text: "Vencido", cls: "badge-danger", disabled: true };
  if (estado === "POR_VENCER") return { text: "Por vencer", cls: "badge-warning", disabled: false };
  if (estado === "STOCK_BAJO") return { text: "Stock bajo", cls: "badge-warning", disabled: false };
  return { text: "", cls: "badge-neutral", disabled: false };
};

const isCategoryCombo = (p) => {
  const id = Number(p.categoriaId);
  const name = String(p.categoriaNombre || "").trim().toUpperCase();
  return id === Number(PRODUCT_CATEGORY_ID_COMBO_ALIAS) || name === "COMBOS";
};

const eqId = (a, b) => String(a) === String(b);

/* =======================
   COMPONENTE
======================= */
export default function ProductGallery({
  onPick,
  selectedIds = [],
  onOpenCombo = () => {}, // callback con el combo completo
}) {
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState("todos");

  const [categoriasProducto, setCategoriasProducto] = useState([]);
  const [productos, setProductos] = useState([]);

  const [combos, setCombos] = useState([]);
  const [loadingCombos, setLoadingCombos] = useState(false);
  const [openingId, setOpeningId] = useState(null); // loading por combo al abrir

  /* Cargar categorías + productos (sin combos) */
  useEffect(() => {
    (async () => {
      try {
        const [catProdRes, prodRes] = await Promise.all([
          get("/api/categoria-productos"),
          get("/api/personal-ventas/productos"),
        ]);

        const cats = Array.isArray(catProdRes.data) ? catProdRes.data : catProdRes.data?.data || [];
        setCategoriasProducto(cats);

        const productosNormalizados = (prodRes.data || prodRes.data?.data || []).map(mapProducto);
        // Oculta los que pertenezcan a la categoría de combos
        setProductos(productosNormalizados.filter((x) => !isCategoryCombo(x)));
      } catch (err) {
        console.error("❌ Error cargando productos:", err);
        setCategoriasProducto([]);
        setProductos([]);
      }
    })();
  }, []);

  /* Cargar combos (buscar por nombre) */
  useEffect(() => {
    if (activeFilter !== "combos") return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoadingCombos(true);
        const { data } = await get("/api/combos/buscar", {
          params: { q: q.trim() },
          signal: controller.signal,
        });
        setCombos((Array.isArray(data) ? data : data?.data || []).map(mapCombo));
      } catch (err) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("❌ Error buscando combos:", err);
          setCombos([]);
        }
      } finally {
        setLoadingCombos(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeFilter, q]);

  /* Filtro de productos por texto y categoría */
  const filteredProductos = useMemo(() => {
    const txt = q.trim().toLowerCase();
    return productos.filter((p) => {
      const byCat =
        activeFilter === "todos" ||
        (activeFilter !== "combos" &&
          String(p.categoriaNombre || "").toLowerCase() === String(activeFilter).toLowerCase());
      const byTxt = !txt || String(p.nombre || "").toLowerCase().includes(txt);
      return byCat && byTxt;
    });
  }, [q, activeFilter, productos]);

  const handlePick = (p, disabled) => {
    if (disabled || activeFilter === "combos") return;
    onPick?.(p);
  };

  // Abrir combo completo al hacer click en la imagen
  const handleOpenCombo = async (combo) => {
    try {
      setOpeningId(combo.id);
      const { data } = await get(`/api/combos/${encodeURIComponent(combo.id)}`);
      onOpenCombo?.(Array.isArray(data) ? data[0] : data);
    } catch (err) {
      console.error("❌ Error obteniendo combo completo:", err);
    } finally {
      setOpeningId(null);
    }
  };

  const selectedIdsStr = selectedIds.map((x) => String(x));

  return (
    <aside className="card h-100 d-flex flex-column">
      <div className="card-header d-flex align-items-center justify-content-between">
        <span>🧺 Galería de Productos</span>
      </div>

      <div className="card-body d-flex flex-column">
        <div className="pill-row mb-2" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <button
            type="button"
            className={`btn btn-sm ${activeFilter === "combos" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveFilter("combos")}
          >
            Combos
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeFilter === "todos" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setActiveFilter("todos")}
          >
            Todos
          </button>
          {categoriasProducto.map((c) => {
            const id = c.ID ?? c.id;
            const name = c.NOMBRE ?? c.nombre ?? "";
            return (
              <button
                key={id ?? name}
                type="button"
                className={`btn btn-sm ${activeFilter === name ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setActiveFilter(name)}
              >
                {name}
              </button>
            );
          })}
        </div>

        {/* Buscador (aplica a ambos) */}
        <input
          className="form-control mb-2"
          placeholder={activeFilter === "combos" ? "Buscar combos por nombre..." : "Buscar productos..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="gallery-viewport" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeFilter === "combos" ? (
            <>
              <h6 className="mb-2">Combos</h6>
              <div className="gallery-grid">
                {loadingCombos && <div className="text-muted">Cargando combos…</div>}
                {!loadingCombos && combos.length === 0 && (
                  <div className="text-muted">No hay combos registrados.</div>
                )}

                {combos.map((c) => {
                  const candidates = getComboImgCandidates(c);
                  return (
                    <div key={c.id} className="prod-card">
                      <div
                        className="prod-thumb"
                        style={{ cursor: "pointer", position: "relative" }}
                        onClick={() => handleOpenCombo(c)}
                        title="Ver detalle del combo"
                      >
                        {candidates.length > 0 ? (
                          <SecureImage candidates={candidates} alt={c.nombre} />
                        ) : null}
                        {openingId === c.id && (
                          <span
                            className="loading-overlay"
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              background: "rgba(255,255,255,0.5)",
                            }}
                          >
                            Cargando…
                          </span>
                        )}
                      </div>
                      <div className="prod-name">{c.nombre}</div>
                      <div className="prod-price">Q{toNumberSafe(c.precio ?? c.precioVenta).toFixed(2)}</div>

                      {c.descripcion && (
                        <div className="prod-meta" style={{ opacity: 0.8 }}>
                          {c.descripcion}
                        </div>
                      )}

                      {/* Mostrar “cantidad disponible : X” */}
                      <div className="prod-meta" style={{ opacity: 0.9 }}>
                        {c.cantidadDisponibleTexto}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="gallery-grid">
              {filteredProductos.map((p) => {
                const { text: badgeText, cls: badgeClass, disabled } = badgeInfo(p);
                const isSelected = selectedIdsStr.some((sid) => eqId(sid, p.id));
                const candidates = getProductoImgCandidates(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`prod-card ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                    onClick={() => handlePick(p, disabled)}
                    aria-disabled={disabled}
                    tabIndex={disabled ? -1 : 0}
                    title={disabled ? "No disponible para agregar" : "Agregar al combo"}
                  >
                    {badgeText && <span className={`estado-badge ${badgeClass}`}>{badgeText}</span>}
                    <div className="prod-thumb">
                      {candidates.length > 0 ? (
                        <SecureImage candidates={candidates} alt={p.nombre} />
                      ) : null}
                    </div>
                    <div className="prod-name">{p.nombre}</div>
                    <div className="prod-price">
                      Q{toNumberSafe(p.precio ?? p.precioVenta).toFixed(2)}
                    </div>
                    <div className="prod-meta">
                      Cantidad: {p.cantidad} {p.unidadMedida ? `| ${p.unidadMedida}` : ""}
                    </div>
                    {!badgeText && p.alerta && (
                      <div className="prod-meta" style={{ opacity: 0.75 }}>
                        {p.alerta}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
