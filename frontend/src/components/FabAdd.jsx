import React from 'react';

export default function FabAdd({ onClick }) {
  return (
    <button type="button" className="fab-add shadow" aria-label="Agregar función" onClick={onClick}>
      +
    </button>
  );
}
