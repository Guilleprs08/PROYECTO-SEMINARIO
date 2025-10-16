// src/pages/reservaConfirmada.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

/* ================== API BASE ================== */
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

/* ======================= Axios con token ======================= */
const client = axios.create({ baseURL: API_BASE, withCredentials: false });
client.interceptors.request.use((cfg) => {
  try {
    const t = localStorage.getItem('mf_token');
    if (t) {
      cfg.headers = cfg.headers || {};
      if (!cfg.headers.Authorization) cfg.headers.Authorization = `Bearer ${t}`;
    }
  } catch {}
  return cfg;
});

/* =================== Helpers de fetch tolerantes =================== */
async function tryGetJson(url, withAuthFirst = true) {
  try {
    if (withAuthFirst) {
      const { data } = await client.get(url);
      return data;
    }
    const { data } = await axios.get(`${API_BASE}${url}`);
    return data;
  } catch {
    return null;
  }
}

/* ======================= Fetch reservas (igual a Historial) ======================= */
async function fetchTodasLasReservas() {
  let data = await tryGetJson('/api/eventos-reservados?all=1');
  const contieneCanceladas = Array.isArray(data) && data.some(r => (r?.ESTADO || '').toUpperCase() === 'CANCELADO');
  const contieneFinalizadas = Array.isArray(data) && data.some(r => (r?.ESTADO || '').toUpperCase() === 'FINALIZADO');

  if ((!contieneCanceladas && !contieneFinalizadas) && Array.isArray(data) && data.length > 0) {
    data = await tryGetJson('/api/eventos-reservados');
  }
  return Array.isArray(data) ? data : [];
}

const safeDate = (v) => { try { const d = new Date(v); return isNaN(d) ? null : d; } catch { return null; } };

/* ============ RESERVAS CONFIRMADAS (tabla más presentable) ============ */
const ReservasRecientes = () => {
  const [reservas, setReservas] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await fetchTodasLasReservas();
        if (!mounted) return;
        const soloReservadas = all
          .filter(r => String(r.ESTADO || '').toUpperCase() === 'RESERVADO')
          .sort((a, b) => (safeDate(b.START_TS)?.getTime() || 0) - (safeDate(a.START_TS)?.getTime() || 0))
          .slice(0, 5);
        setReservas(soloReservadas);
      } catch {
        setErr('No se pudieron cargar reservas confirmadas.');
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="card">
      <style>{`
        .rz-table { width:100%; border-collapse:separate; border-spacing:0; }
        .rz-th, .rz-td { padding:10px 12px; text-align:center; }
        .rz-th { font-weight:700; color:#0f172a; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
        .rz-tr:nth-child(even) .rz-td { background:#fbfcfe; }
        .rz-chip { display:inline-block; padding:.2rem .6rem; border-radius:999px; background:#eef2ff; color:#4338ca; font-weight:600; }
        .rz-pill { display:inline-block; padding:.2rem .6rem; border-radius:999px; background:#f1f5f9; }
      `}</style>

      <div className="card-header" style={{ alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>🔔</span>
          <h3 className="card-title m-0">Reservas confirmadas</h3>
        </div>
      </div>

      {err && <p className="text-red-600">{err}</p>}
      {reservas.length === 0 ? (
        <p style={{ margin:'10px 0 0 0' }}>No hay reservas confirmadas recientes</p>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table className="rz-table">
            <thead>
              <tr className="rz-tr">
                <th className="rz-th">Sala</th>
                <th className="rz-th">Fecha y hora</th>
                <th className="rz-th">Personas</th>
                <th className="rz-th">Estado</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((r) => {
                const sala = r.SALA_NOMBRE || (r.SALA_ID ? `Sala ${r.SALA_ID}` : 'Sala');
                const fecha = safeDate(r.START_TS)?.toLocaleString() || '-';
                const personas = r.PERSONAS || 0;
                return (
                  <tr key={r.ID_EVENTO} className="rz-tr">
                    <td className="rz-td"><span className="rz-pill">{sala}</span></td>
                    <td className="rz-td">{fecha}</td>
                    <td className="rz-td">{personas}</td>
                    <td className="rz-td"><span className="rz-chip">{(r.ESTADO || '').toUpperCase()}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReservasRecientes;
