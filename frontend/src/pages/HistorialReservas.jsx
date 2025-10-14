// src/pages/HistorialReservas.jsx
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

function fmtDate(d) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString();
  } catch {
    return String(d);
  }
}

const badgeStyle = (estado) => {
  const base = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 600,
  };
  switch (String(estado || "").toUpperCase()) {
    case "RESERVADO":
      return { ...base, background: "#DCFCE7", color: "#166534", border: "1px solid #86efac" };
    case "CANCELADO":
      return { ...base, background: "#FEE2E2", color: "#991B1B", border: "1px solid #fecaca" };
    case "FINALIZADO":
      return { ...base, background: "#E5E7EB", color: "#111827", border: "1px solid #d1d5db" };
    default:
      return { ...base, background: "#E5E7EB", color: "#111827" };
  }
};

export default function HistorialReservas() {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filtro, setFiltro] = useState("TODAS"); // TODAS | ACTIVAS | CANCELADAS | FINALIZADO

  useEffect(() => {
    let cancel = false;

    async function load() {
      setLoading(true);
      setErr("");
      try {
        // 1) intenta traer todo
        let url = `${API_BASE}/api/eventos-reservados?all=1`;
        let { data } = await axios.get(url);

        // 2) fallback si el backend ignora all=1
        const contieneCanceladas = Array.isArray(data) && data.some(r => (r?.ESTADO || "").toUpperCase() === "CANCELADO");
        const contieneFinalizadas = Array.isArray(data) && data.some(r => (r?.ESTADO || "").toUpperCase() === "FINALIZADO");
        if ((!contieneCanceladas && !contieneFinalizadas) && Array.isArray(data) && data.length > 0) {
          const res2 = await axios.get(`${API_BASE}/api/eventos-reservados`);
          data = res2.data;
        }

        if (!cancel) setReservas(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (!cancel) setErr("No se pudo cargar el historial.");
      } finally {
        if (!cancel) setLoading(false);
      }
    }

    load();
    return () => { cancel = true; };
  }, []);

  const filtradas = useMemo(() => {
    const upper = (s) => String(s || "").toUpperCase();
    switch (filtro) {
      case "ACTIVAS":
        return reservas.filter(r => upper(r.ESTADO) === "RESERVADO");
      case "CANCELADAS":
        return reservas.filter(r => upper(r.ESTADO) === "CANCELADO");
      case "FINALIZADO":
        return reservas.filter(r => upper(r.ESTADO) === "FINALIZADO");
      default:
        return reservas;
    }
  }, [reservas, filtro]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Historial de eventos reservados</h2>

      {/* Filtros simples */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["TODAS", "ACTIVAS", "CANCELADAS", "FINALIZADO"].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: filtro === f ? "2px solid #111827" : "1px solid #d1d5db",
              background: filtro === f ? "#f3f4f6" : "white",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && <p>Cargando…</p>}
      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      {!loading && filtradas.length === 0 && <p>No hay registros.</p>}

      {/* Lista sencilla en tarjetas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtradas.map((r) => {
          const estado = String(r.ESTADO || "").toUpperCase();
          return (
            <div key={r.ID_EVENTO}
                 style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong>{r.SALA_NOMBRE || `Sala ${r.SALA_ID}`}</strong>
                <span style={badgeStyle(estado)}>{estado}</span>
              </div>

              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.4 }}>
                <div><b>Inicio:</b> {fmtDate(r.START_TS)}</div>
                <div><b>Fin:</b> {fmtDate(r.END_TS)}</div>
                <div><b>Personas:</b> {r.PERSONAS ?? 0}</div>
                {r.CLIENTE_ID ? <div><b>Cliente ID:</b> {r.CLIENTE_ID}</div> : null}
                {r.NOTAS ? <div style={{ marginTop: 6 }}><b>Notas:</b> {String(r.NOTAS).replace(/\[UEMAIL:[^\]]+\]\s*/i, "")}</div> : null}
              </div>

              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                <div><b>Creado:</b> {fmtDate(r.CREATED_AT)}</div>
                <div><b>ID:</b> {r.ID_EVENTO}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
