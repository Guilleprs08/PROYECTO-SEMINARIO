import React from 'react';

const ConfirmarEliminacion = ({
  show,
  titulo,
  onCancel,
  onConfirm,
  loading
}) => {
  if (!show) return null;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100"
      style={{ zIndex: 1090 }}
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !loading) onCancel();
        if (e.key === 'Enter' && !loading) onConfirm();
      }}
    >
      {/* Fondo oscuro */}
      <div
        className="w-100 h-100 bg-dark bg-opacity-50"
        onClick={() => !loading && onCancel()}
      />

      {/* Contenido del modal */}
      <div
        className="position-absolute top-50 start-50 translate-middle"
        style={{ minWidth: 380 }}
      >
        <div className="card shadow-lg rounded-3">
          <div className="card-body">
            <div className="d-flex align-items-start gap-3">
              <div className="rounded-circle bg-danger bg-opacity-10 p-2">
                <i className="bi bi-exclamation-triangle-fill text-danger" />
              </div>
              <div className="flex-grow-1">
                <h6 className="fw-semibold mb-1">¿Eliminar este registro?</h6>
                <p className="text-muted small mb-1">
                  Vas a eliminar: <strong>{titulo}</strong>.
                </p>
                <p className="text-muted small mb-0">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onCancel}
                disabled={loading}
                autoFocus
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onConfirm}
                disabled={loading}
              >
                {loading ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmarEliminacion;
