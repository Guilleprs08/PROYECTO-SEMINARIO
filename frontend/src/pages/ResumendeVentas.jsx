// src/views/CortedeCaja.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import axios from "axios";
import "../styles/cortedeCaja.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

/* === helper: descarga PDF desde el backend === */
async function exportarPDF({ filtros, rows, total }) {
  const url = `${API_BASE}/api/pdf/detalles-venta`;
  const { data } = await axios.post(url, { filtros, rows, total }, { responseType: "blob" });
  const blob = new Blob([data], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "detalles_venta.pdf";
  link.click();
  URL.revokeObjectURL(link.href);
}

/* === helper: descarga Excel desde el backend === */
async function exportarExcel({ filtros, rows }) {
  const url = `${API_BASE}/api/excel/detalles-venta/excel`;
  const { data } = await axios.post(url, { filtros, rows }, { responseType: "blob" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "detalles_venta.xlsx";
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function CortedeCaja() {
  // ---- opciones dinámicas desde backend ----
  const [rangosOpts, setRangosOpts] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [rangosFechas, setRangosFechas] = useState(null);

  // ---- filtros seleccionados ----
  const [rango,   setRango] = useState("");
  const [desde,   setDesde] = useState("");
  const [hasta,   setHasta] = useState("");
  const [cajaId,  setCajaId] = useState("");
  const [tipo,    setTipo] = useState("");
  const [roleId,  setRoleId] = useState("");
  const [vendedorId, setVendedorId] = useState("");

  // ---- resultados ----
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  // ---- manejo de errores de formulario ----
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);

  const totalGeneral = useMemo(
    () => rows.reduce((acc, r) => acc + Number(r.subtotal || 0), 0),
    [rows]
  );

  const isPersonalizado = rango === "personalizado";

  // --------- cargar filtros y rangos al inicio ----------
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/corte-caja/filtros`);
        setRangosOpts(Array.isArray(data?.rangos) ? data.rangos : []);
        setCajas(Array.isArray(data?.cajas) ? data.cajas : []);
        setTipos(Array.isArray(data?.tipos) ? data.tipos : []);
        setRoles(Array.isArray(data?.roles) ? data.roles : []);
        setVendedores(Array.isArray(data?.vendedores) ? data.vendedores : []);
      } catch (err) {
        console.error("❌ Error cargando filtros:", err);
      }
    })();

    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/corte-caja/rangos`);
        setRangosFechas(data || null);
      } catch (err) {
        console.error("❌ Error cargando rangos:", err);
      }
    })();
  }, []);

  // --------- recargar vendedores cuando cambia el rol ----------
  useEffect(() => {
    (async () => {
      try {
        const url = roleId
          ? `${API_BASE}/api/corte-caja/filtros?role_id=${roleId}`
          : `${API_BASE}/api/corte-caja/filtros`;
        const { data } = await axios.get(url);
        const V = Array.isArray(data?.vendedores) ? data.vendedores : [];
        setVendedores(V);
        if (!V.some(v => v.id === vendedorId)) setVendedorId("");
      } catch (err) {
        console.error("❌ Error recargando vendedores:", err);
        setVendedores([]);
        setVendedorId("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  // --------- autocompletar fechas cuando el rango NO es personalizado ----------
  useEffect(() => {
    if (!rangosFechas) return;

    if (rango && rango !== "personalizado" && rangosFechas[rango]) {
      setDesde(rangosFechas[rango].desde || "");
      setHasta(rangosFechas[rango].hasta || "");
    } else if (rango === "personalizado") {
      setDesde(d => d || "");
      setHasta(h => h || "");
    } else if (!rango) {
      setDesde("");
      setHasta("");
    }
  }, [rango, rangosFechas]);

  // --------- llamada real al backend + validación visual ----------
  const handleVer = async () => {
    const nextErrors = {};
    if (!rango) nextErrors.rango = "Selecciona un rango.";
    if (isPersonalizado) {
      if (!desde) nextErrors.desde = "Selecciona la fecha inicial.";
      if (!hasta) nextErrors.hasta = "Selecciona la fecha final.";
    }
    if (!cajaId) nextErrors.cajaId = "Selecciona una caja.";
    if (!tipo) nextErrors.tipo = "Selecciona el tipo de venta.";
    if (!roleId) nextErrors.roleId = "Selecciona un rol.";
    if (!vendedorId) nextErrors.vendedorId = "Selecciona un vendedor.";

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setShown(false);
      setTimeout(() => {
        const firstInvalid = (formRef.current || document).querySelector(".invalid");
        firstInvalid?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    setErrors({});

    setLoading(true);
    setShown(false);

    try {
      const { data } = await axios.get(`${API_BASE}/api/corte-caja/resumen`, {
        params: {
          rango, desde, hasta,
          caja_id: cajaId,
          tipo, vendedor_id: vendedorId,
        },
      });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setShown(true);
    } catch (err) {
      console.error("❌ Error consultando resumen:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const resolveTipoFila = (r) =>
    r.tipo || r.origen || ((r.es_combo === true || r.esCombo === true) ? "Combo" : "Producto");

  const handleExportPDF = async () => {
    if (!rows.length) return;
    const rangoLabel = rangosOpts.find(o => o.value === rango)?.label || "";
    const cajaNombre = cajas.find(c => c.id === Number(cajaId))?.nombre || "";
    const tipoLabel = tipos.find(t => t.value === tipo)?.label || "";
    const rolNombre = roles.find(r => r.id === Number(roleId))?.nombre || "";
    const vendNombre = vendedores.find(v => v.id === Number(vendedorId))?.nombre || "";

    const resolvedDesde = isPersonalizado ? desde : (rangosFechas?.[rango]?.desde || desde || "");
    const resolvedHasta = isPersonalizado ? hasta : (rangosFechas?.[rango]?.hasta || hasta || "");

    const filtros = {
      rango, rangoLabel,
      desde: resolvedDesde || null,
      hasta: resolvedHasta || null,
      cajaId, cajaNombre,
      tipo, tipoLabel,
      roleId, rolNombre,
      vendedorId, vendNombre,
      generadoEn: new Date().toISOString(),
    };

    const rowsForPdf = rows.map(r =>
      (tipo === "todos" && !r.tipo) ? { ...r, tipo: resolveTipoFila(r) } : r
    );

    try { await exportarPDF({ filtros, rows: rowsForPdf, total: totalGeneral }); }
    catch (e) { console.error("❌ Error exportando PDF:", e); }
  };

  const handleExportExcel = async () => {
    if (!rows.length) return;
    const rangoLabel = rangosOpts.find(o => o.value === rango)?.label || "";
    const cajaNombre = cajas.find(c => c.id === Number(cajaId))?.nombre || "";
    const tipoLabel = tipos.find(t => t.value === tipo)?.label || "";
    const rolNombre = roles.find(r => r.id === Number(roleId))?.nombre || "";
    const vendNombre = vendedores.find(v => v.id === Number(vendedorId))?.nombre || "";

    const resolvedDesde = isPersonalizado ? desde : (rangosFechas?.[rango]?.desde || desde || "");
    const resolvedHasta = isPersonalizado ? hasta : (rangosFechas?.[rango]?.hasta || hasta || "");

    const filtros = {
      rango, rangoLabel,
      desde: resolvedDesde || null,
      hasta: resolvedHasta || null,
      cajaId, cajaNombre,
      tipo, tipoLabel,
      roleId, rolNombre,
      vendedorId, vendedorNombre: vendNombre,
      generadoEn: new Date().toISOString(),
    };

    const rowsForExcel = rows.map(r => ({
      NOMBRE: r.nombre,
      TIPO: (tipo === "todos" ? (r.tipo || resolveTipoFila(r)) : undefined),
      CANTIDAD_VENDIDA: Number(r.cantidad) || 0,
      PRECIO_UNITARIO: Number(r.precio) || 0,
      SUBTOTAL: Number(r.subtotal) || 0,
    }));

    try { await exportarExcel({ filtros, rows: rowsForExcel }); }
    catch (e) { console.error("❌ Error exportando Excel:", e); }
  };

  return (
    <div className="cc-page">
      <div className="cc-head">
        <h2>Detalles de Venta</h2>
        <p className="cc-sub">Consulta compacta por rango, caja, tipo, rol y vendedor.</p>
      </div>

      {/* -------- Filtros -------- */}
      <div ref={formRef} className="cc-card cc-filters">
        <div className="cc-field span-3">
          <label>RANGO DE FECHA</label>
          <select
            className={errors.rango ? "invalid" : ""}
            value={rango}
            onChange={(e) => { setRango(e.target.value); setErrors(s => ({...s, rango: undefined})); }}
          >
            <option value="">Seleccione…</option>
            {rangosOpts.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {errors.rango && <p className="cc-error">{errors.rango}</p>}
        </div>

        {isPersonalizado && (
          <>
            <div className="cc-field">
              <label>Fecha Desde</label>
              <input
                type="date"
                className={errors.desde ? "invalid" : ""}
                value={desde}
                onChange={(e) => { setDesde(e.target.value); setErrors(s => ({...s, desde: undefined})); }}
              />
              {errors.desde && <p className="cc-error">{errors.desde}</p>}
            </div>

            <div className="cc-field">
              <label>Fecha Hasta</label>
              <input
                type="date"
                className={errors.hasta ? "invalid" : ""}
                value={hasta}
                onChange={(e) => { setHasta(e.target.value); setErrors(s => ({...s, hasta: undefined})); }}
              />
              {errors.hasta && <p className="cc-error">{errors.hasta}</p>}
            </div>
          </>
        )}

        <div className="cc-field">
          <label>CAJA</label>
          <select
            className={errors.cajaId ? "invalid" : ""}
            value={cajaId}
            onChange={(e) => { setCajaId(Number(e.target.value) || ""); setErrors(s => ({...s, cajaId: undefined})); }}
          >
            <option value="">Seleccione…</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          {errors.cajaId && <p className="cc-error">{errors.cajaId}</p>}
        </div>

        <div className="cc-field">
          <label>TIPO DE VENTA</label>
          <select
            className={errors.tipo ? "invalid" : ""}
            value={tipo}
            onChange={(e) => { setTipo(e.target.value); setErrors(s => ({...s, tipo: undefined})); }}
          >
            <option value="">Seleccione…</option>
            {tipos.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {errors.tipo && <p className="cc-error">{errors.tipo}</p>}
        </div>

        <div className="cc-field">
          <label>ROL</label>
          <select
            className={errors.roleId ? "invalid" : ""}
            value={roleId}
            onChange={(e) => { setRoleId(Number(e.target.value) || ""); setErrors(s => ({...s, roleId: undefined})); }}
          >
            <option value="">Seleccione…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
          {errors.roleId && <p className="cc-error">{errors.roleId}</p>}
        </div>

        <div className="cc-field">
          <label>VENDEDOR</label>
          <select
            className={errors.vendedorId ? "invalid" : ""}
            value={vendedorId}
            onChange={(e) => { setVendedorId(Number(e.target.value) || ""); setErrors(s => ({...s, vendedorId: undefined})); }}
          >
            <option value="">Seleccione…</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </select>
          {errors.vendedorId && <p className="cc-error">{errors.vendedorId}</p>}
        </div>

        {/* Acciones (botones negros sin íconos) */}
        <div className="cc-actions">
          <button
            className={`btn-pill ${loading ? "is-disabled" : ""}`}
            onClick={handleVer}
            disabled={loading}
          >
            Ver Resultados
          </button>

          <button
            className={`btn-pill ${loading || !rows.length ? "is-disabled" : ""}`}
            onClick={handleExportPDF}
            disabled={loading || !rows.length}
            title={!rows.length ? "Primero ejecuta una consulta" : "Exportar PDF"}
          >
            Exportar PDF
          </button>

          <button
            className={`btn-pill ${loading || !rows.length ? "is-disabled" : ""}`}
            onClick={handleExportExcel}
            disabled={loading || !rows.length}
            title={!rows.length ? "Primero ejecuta una consulta" : "Exportar Excel"}
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {/* -------- Resultados -------- */}
      <div className={`cc-card cc-results ${shown ? "show" : ""}`}>
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Nombre</th>
                {tipo === "todos" && <th>Tipo</th>}
                <th className="num">Cantidad vendida</th>
                <th className="num">Precio unit. (Q)</th>
                <th className="num">Subtotal (Q)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="skeleton">
                    <td><span /></td>
                    {tipo === "todos" && <td><span /></td>}
                    <td className="num"><span /></td>
                    <td className="num"><span /></td>
                    <td className="num"><span /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tipo === "todos" ? 5 : 4} className="empty">
                    No hay resultados para mostrar<br />
                    <span className="empty-sub">Seleccione los filtros y haga clic en “Ver Resultados”.</span>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.nombre}</td>
                    {tipo === "todos" && <td>{resolveTipoFila(r)}</td>}
                    <td className="num">{Number(r.cantidad).toLocaleString()}</td>
                    <td className="num">Q{Number(r.precio).toFixed(2)}</td>
                    <td className="num strong">Q{Number(r.subtotal).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="strong">Total general</td>
                  {tipo === "todos" && <td />}
                  <td />
                  <td />
                  <td className="num strong">Q{totalGeneral.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
