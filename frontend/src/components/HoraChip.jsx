// src/components/HoraChip.jsx
import React from 'react';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';

const absUrl = (u) => {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `${API_BASE}${u.startsWith('/') ? '' : '/'}${u}`;
};

export default function HoraChip({
  date,        // 'YYYY-MM-DD'
  start,       // 'HH:MM'
  end,         // 'HH:MM'
  overnight,   // boolean
  title,
  formato,     // para funciones
  price,       // para funciones
  poster,      // para funciones
  badgeText,   // p.ej. tipo de evento
  variant = 'funcion', // 'funcion' | 'evento'
  onClick
}) {
  const img = absUrl(poster);
  const cls = `hora-chip ${variant === 'evento' ? 'hora-chip--evento' : ''}`;

  const formatFecha = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    const wd = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth()+1).padStart(2, '0');
    const yy = d.getFullYear();
    const cap = wd.charAt(0).toUpperCase() + wd.slice(1).toLowerCase();
    return `${cap} ${dd}/${mm}/${yy}`;
  };

  return (
    <button type="button" className={cls} onClick={onClick}>
      {variant !== 'evento' && (img
        ? <img className="hora-chip__poster" src={img} alt={title} />
        : <div className="hora-chip__poster placeholder" />
      )}

      <div className="hora-chip__content">
        {date && (
          <div className="hora-chip__date">
            <i className="bi bi-calendar me-1" />
            <span>{formatFecha(date)}</span>
          </div>
        )}

        <div className="hora-chip__time">
          <i className="bi bi-clock me-1" />
          <span>{start} — {end}{overnight ? ' (+1)' : ''}</span>
        </div>

        <div className="hora-chip__title" title={title}>
          {title || (variant === 'evento' ? 'Evento' : 'Función')}
        </div>

        <div className="hora-chip__meta">
          {variant === 'funcion' && (
            <>
              {formato && <span className="badge gr-light text-dark me-2">{formato}</span>}
              <span className="hora-chip__price">Q {Number(price || 0).toFixed(2)}</span>
            </>
          )}
          {variant === 'evento' && (
            <span className="badge badge-evento me-2">{badgeText || 'Evento'}</span>
          )}
        </div>
      </div>
    </button>
  );
}
