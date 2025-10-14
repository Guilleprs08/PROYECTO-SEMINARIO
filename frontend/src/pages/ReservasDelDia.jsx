// src/pages/ReservasDelDia.jsx
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "../styles/dashboard.css"; // reutilizamos estilos de cards

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function ymd(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDT(iso) {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    return dt.toLocaleString("es-GT", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function cleanNotas(t) {
  if (!t) return "";
  // Elimina tags [UEMAIL:...]
  return t.replace(/\[UEMAIL:[^\]]+\]/gi, "").replace(/\s{2,}/g, " ").trim();
}

function BadgeEstado({ estado }) {
  const e = (estado || "").toUpperCase();
  const cls =
    e === "CANCELADO"
      ? "badge badge-cancel"
      : e === "FINALIZADO"
      ? "badge badge-finalizado"
      : "badge badge-ok";
  const txt = e || "RESERVADO";
  return <span className={cls}>{txt}</span>;
}

export default function ReservasDelDia() {
  const [fecha, setFecha] = useState(ymd());
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const total = items?.length || 0;

  async function cargar(f) {
    setCargando(true);
    try {
      const url = `${API_BASE}/api/eventos-reservados?fecha=${f}`;
      const { data } = await axios.get(url, { headers: { ...authHeaders() } });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar(fecha);
  }, [fecha]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Reservas del día</h2>
        <div className="filters">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <button className="btn" onClick={() => setFecha(ymd())}>
            Hoy
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12, opacity: 0.8 }}>
        {cargando ? "Cargando..." : `Resultados: ${total}`}
      </div>

      {total === 0 && !cargando && (
        <div className="empty">No hay reservas para esa fecha.</div>
      )}

      <div className="cards-grid">
        {items.map((ev) => (
          <div key={ev.ID_EVENTO} className="card card-reserva">
            <div className="card-header">
              <div className="sala">{ev.SALA_NOMBRE || `Sala ${ev.SALA_ID}`}</div>
              <BadgeEstado estado={ev.ESTADO} />
            </div>

            <div className="card-body">
              <p>
                <strong>Inicio:</strong> {fmtDT(ev.START_TS)}
              </p>
              <p>
                <strong>Fin:</strong> {fmtDT(ev.END_TS)}
              </p>
              <p>
                <strong>Personas:</strong> {ev.PERSONAS}
              </p>
              {ev.NOTAS && (
                <p>
                  <strong>Notas:</strong> {cleanNotas(ev.NOTAS)}
                </p>
              )}
              <p className="meta">
                <small>
                  <strong>Creado:</strong> {fmtDT(ev.CREATED_AT)} &nbsp;|&nbsp;
                  <strong>ID:</strong> {ev.ID_EVENTO}
                </small>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
