// src/components/CarouselHero.jsx
import React, { useMemo, useState } from 'react';

const ratioBox = { position: 'relative', width: '100%', paddingTop: '42%' }; // ~21:9
const abs = { position: 'absolute', inset: 0 };

function bestPoster(p) {
  // intenta opciones de mayor a menor calidad
  return (
    p.posterHD || p.backdropHD || p.backdrop || p.poster ||
    p.PosterHD || p.BackdropHD || p.Poster || p.Imagen ||
    p.image || p.img || ''
  );
}
function lowRes(p) {
  return p.thumb || p.thumbnail || p.poster || p.backdrop || '';
}

export default function CarouselHero({ items = [], onVerFunciones }) {
  const slides = useMemo(() => items.map((p, i) => ({
    id: p.id || i,
    titulo: p.titulo || p.title || p.nombre || 'Sin título',
    clasif: p.clasificacion || p.rating || '',
    genero: p.genero || p.genre || '',
    hi: bestPoster(p),
    lo: lowRes(p),
  })), [items]);

  const [idx, setIdx] = useState(0);
  const go = (d) => setIdx((i) => (i + d + slides.length) % slides.length);

  if (!slides.length) return null;

  const s = slides[idx];

  return (
    <div className="wc-hero">
      <div style={ratioBox}>
        <div style={abs} className="wc-hero-layer">
          {/* imagen: técnica blur-up + object-fit cover */}
          {s.lo && (
            <img
              src={s.lo}
              alt={s.titulo}
              className="wc-hero-img wc-hero-img--blur"
              loading="eager"
              decoding="async"
            />
          )}
          <img
            src={s.hi || s.lo}
            srcSet={s.hi ? `${s.hi} 1280w, ${s.hi} 1920w` : undefined}
            sizes="(max-width: 768px) 100vw, 1200px"
            alt={s.titulo}
            className="wc-hero-img"
            loading="lazy"
            decoding="async"
          />
          <div className="wc-hero-grad" />
        </div>

        {/* Contenido */}
        <div style={abs} className="wc-hero-content">
          <h2 className="wc-hero-title">{s.titulo}</h2>
          {(s.clasif || s.genero) && (
            <div className="wc-hero-sub">
              {s.clasif ? <span>{s.clasif}</span> : null}
              {s.clasif && s.genero ? <span> · </span> : null}
              {s.genero ? <span>{s.genero}</span> : null}
            </div>
          )}
          {onVerFunciones && (
            <button className="wc-hero-btn" onClick={() => onVerFunciones(s)}>
              Ver funciones
            </button>
          )}
        </div>

        {/* Controles */}
        <button className="wc-hero-nav wc-hero-nav--left" onClick={() => go(-1)} aria-label="Anterior">❮</button>
        <button className="wc-hero-nav wc-hero-nav--right" onClick={() => go(1)} aria-label="Siguiente">❯</button>

        {/* Dots */}
        <div className="wc-hero-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`wc-hero-dot ${i === idx ? 'is-active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Ir a slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
