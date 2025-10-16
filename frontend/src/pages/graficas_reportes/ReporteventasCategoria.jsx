import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/* Chart.js */
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/* Estilos */
import "../../styles/graficas_reportes/ventas-categoria.css";

/* Config API */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

/* Helpers */
const fmtGTQ = (n) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", maximumFractionDigits: 2 })
    .format(Number(n || 0));
const pad2 = (n) => String(n).padStart(2, "0");
function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  return {
    desde: `${pad2(first.getDate())}/${pad2(first.getMonth() + 1)}/${first.getFullYear()}`,
    hasta: `${pad2(last.getDate())}/${pad2(last.getMonth() + 1)}/${last.getFullYear()}`,
  };
}
function isValidCurrentMonthRange(desde, hasta) {
  const [dD, dM, dY] = (desde||"").split("/").map(Number);
  const [hD, hM, hY] = (hasta||"").split("/").map(Number);
  const d = new Date(dY, dM - 1, dD), h = new Date(hY, hM - 1, hD);
  const now = new Date();
  return (
    dY === hY && dM === hM &&
    dY === now.getFullYear() && (dM - 1) === now.getMonth() &&
    d <= h
  );
}

/* Componente */
export default function ReporteventasCategoria() {
  const [filtros, setFiltros] = useState(currentMonthRange());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [resp, setResp] = useState(null);

  const onChange = (e) => setFiltros((s) => ({ ...s, [e.target.name]: e.target.value }));

  const fetchData = async () => {
    setErr("");
    if (!isValidCurrentMonthRange(filtros.desde, filtros.hasta)) {
      setErr("El rango debe pertenecer al mes actual y ser válido (DD/MM/YYYY).");
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/api/reportes/ventas-snacks`, { params: filtros });
      if (!data?.ok) throw new Error(data?.error || "Respuesta inválida");
      setResp(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // carga inicial

  /* Exportaciones */
  const exportPDF = async () => {
    try {
      const { data: blob } = await axios.get(`${API_BASE}/api/reportes/ventas-snacks/pdf`, {
        params: filtros, responseType: "blob"
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "reporte_ventas_categoria.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("No se pudo exportar a PDF."); }
  };
  const exportExcel = async () => {
    try {
      const { data: blob } = await axios.get(`${API_BASE}/api/reportes/ventas-snacks/excel`, {
        params: filtros, responseType: "blob"
      });
      const url = URL.createObjectURL(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = "reporte_ventas_categoria.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("No se pudo exportar a Excel."); }
  };

  /* Derivados para UI */
  const t = resp?.totales || {};
  const p = resp?.participacion || {};
  const m = resp?.variacion_mom || {};
  const cards = [
    { key:"snacks_caja",    title:"Snacks (Caja)",    total:t.snacks_caja||0,    pct:p.snacks_caja??0,    mom:m.snacks_caja },
    { key:"combos_caja",    title:"Combos (Caja)",    total:t.combos_caja||0,    pct:p.combos_caja??0,    mom:m.combos_caja },
    { key:"snacks_cliente", title:"Snacks (Cliente)", total:t.snacks_cliente||0, pct:p.snacks_cliente??0, mom:m.snacks_cliente },
  ];

  const doughnutData = useMemo(() => ({
    labels:["Snacks (Caja)","Combos (Caja)","Snacks (Cliente)"],
    datasets:[{ data:[t.snacks_caja||0, t.combos_caja||0, t.snacks_cliente||0] }]
  }), [t.snacks_caja, t.combos_caja, t.snacks_cliente]);

  const barData = useMemo(() => ({
    labels:["Snacks (Caja)","Combos (Caja)","Snacks (Cliente)"],
    datasets:[{ label:"Ventas (GTQ)", data:[t.snacks_caja||0, t.combos_caja||0, t.snacks_cliente||0] }]
  }), [t.snacks_caja, t.combos_caja, t.snacks_cliente]);

  const monthText = useMemo(() => {
    if (!resp?.rango) return "";
    const [, m, y] = resp.rango.desde.split("/");
    const names=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    return `${names[Number(m)-1]} ${y}`;
  }, [resp]);

  return (
    <div className="reporte-categorias">
      {/* Encabezado */}
      <div className="reporte-head">
        <h2>Reporte de Ventas por Categoría</h2>
        <div className="reporte-sub">{monthText ? `Período: ${monthText}` : "Período: —"}</div>
      </div>

      {/* Filtros (solo inputs con placeholder) */}
      <div className="rc-filtros">
        <input className="rc-input" name="desde" value={filtros.desde}
               onChange={onChange} placeholder="Desde (DD/MM/YYYY)" />
        <input className="rc-input" name="hasta" value={filtros.hasta}
               onChange={onChange} placeholder="Hasta (DD/MM/YYYY)" />
        <button className="rc-btn" onClick={fetchData} disabled={loading}>
          {loading ? "Cargando..." : "Aplicar"}
        </button>
        {err && <div className="rc-error">{err}</div>}
      </div>

      {/* Acciones */}
      <div className="rc-actions">
        <button className="rc-btn-export rc-btn-pdf" onClick={exportPDF} title="Exportar a PDF">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          Exportar a PDF
        </button>
        <button className="rc-btn-export rc-btn-xls" onClick={exportExcel} title="Exportar a Excel">
          <svg viewBox="0 0 24 24"><path d="M3 3h18v2H3zM3 19h18v2H3zM7 8h3v8H7zM12 11h3v5h-3zM17 6h3v10h-3z"/></svg>
          Exportar a Excel
        </button>
      </div>

      {/* Cards */}
      <div className="rc-cards">
        {cards.map((c) => (
          <div key={c.key} className="rc-card">
            <div className="rc-kicker">{c.title}</div>
            <div className="rc-total">{fmtGTQ(c.total)}</div>
            <div className="rc-sub">{c.pct}% del total</div>
            <hr className="rc-hr" />
            <div className="rc-mom">
              Variación vs mes anterior:{" "}
              {c.mom === null || Number.isNaN(c.mom)
                ? <span className="rc-mom-null">—</span>
                : c.mom > 0
                  ? <span className="rc-mom-up">▲ {c.mom}%</span>
                  : c.mom < 0
                    ? <span className="rc-mom-down">▼ {Math.abs(c.mom)}%</span>
                    : <span className="rc-mom-null">0%</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Gráficas (cada una con 50% de altura del panel) */}
      <div className="rc-panels">
        <div className="rc-panel">
          <div className="rc-title">Participación por Categoría</div>
          <div className="rc-chart">
            <Doughnut
              data={doughnutData}
              options={{
                maintainAspectRatio:false,
                plugins:{ legend:{ position:"bottom" }, tooltip:{ callbacks:{ label:(c)=>fmtGTQ(c.parsed) }}},
                cutout:"60%",
              }}
            />
          </div>
        </div>

        <div className="rc-panel">
          <div className="rc-title">Comparativa de Ventas</div>
          <div className="rc-chart">
            <Bar
              data={barData}
              options={{
                maintainAspectRatio:false,
                plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=>fmtGTQ(c.parsed.y) }}},
                scales:{
                  y:{ beginAtZero:true,
                      ticks:{ callback:(v)=>new Intl.NumberFormat("es-GT",{style:"currency",currency:"GTQ",maximumFractionDigits:0}).format(v) } }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
