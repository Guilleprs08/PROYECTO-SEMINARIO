import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// Mantiene tu convención de API_BASE
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

const get = (p, cfg = {}) =>
  axios.get(`${API_BASE}${p}`, { withCredentials: false, ...(cfg || {}) });

export default function TipoCambioBadge({ className = '' }) {
  const [state, setState] = useState({ ref: null, fecha: null, loading: true });

  const fetchTipoCambio = async () => {
    try {
      const { data } = await get('/api/tipo-cambio/hoy');
      const ref = (data?.referencia && !isNaN(data.referencia))
        ? Number(data.referencia).toFixed(2)
        : null;
      setState({ ref, fecha: data?.fecha || null, loading: false });
    } catch {
      setState({ ref: null, fecha: null, loading: false });
    }
  };

  useEffect(() => {
    fetchTipoCambio();
    // refresco cada 3 horas por si lo dejas mucho tiempo abierto
    const id = setInterval(fetchTipoCambio, 3 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const label = useMemo(() => {
    if (state.loading) return 'Cargando TC…';
    if (!state.ref) return 'TC no disponible';
    return `TC Banguat: Q ${state.ref}`;
  }, [state]);

  return (
    <span
      className={
        'tc-badge inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ' +
        'shadow-sm bg-pink-100/70 text-pink-800 border border-pink-300 ' +
        className
      }
      title={state.fecha ? `Fecha: ${state.fecha}` : 'Tipo de cambio de referencia'}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"
           viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm.75 4.5a.75.75 0 00-1.5 0v.568a3.751 3.751 0 00-2.838 2.36.75.75 0 101.414.492A2.25 2.25 0 0111.25 9h1.5a1.5 1.5 0 010 3h-1a2.25 2.25 0 00-2.25 2.25v.25a.75.75 0 001.5 0v-.25c0-.414.336-.75.75-.75h1a3 3 0 100-6h-.75V7.5z" />
      </svg>
      {label}
    </span>
  );
}
