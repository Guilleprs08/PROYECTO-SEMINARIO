// src/components/combos/ComboItemsTable.jsx
import React from "react";

/** Formatea a Quetzales (GTQ) con locale es-GT */
const formatMoney = (n) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(n || 0));

/** Normalizadores */
const getId = (it) => it?.id ?? it?.ID ?? it?.codigo_barras ?? it?.CODIGO_BARRAS ?? String(Math.random());
const getNombre = (it) => it?.nombre ?? it?.NOMBRE ?? "(Sin nombre)";
const getPrecioUnit = (it) =>
  it?.precio_venta ?? it?.precioVenta ?? it?.PRECIO_VENTA ?? it?.precio ?? 0;

export default function ComboItemsTable({ items = [], removeItem }) {
  const handleRemove = (it) => {
    const id = getId(it);
    if (typeof removeItem === "function") removeItem(id);
  };

  return (
    <section className="card mb-3">
      <div className="card-header">Items del Combo</div>
      <div className="card-body p-0">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="text-center">Cantidad</th>
              <th className="text-end">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const id = getId(it);
              const nombre = getNombre(it);
              const precio = Number(getPrecioUnit(it) || 0);
              const cant = 1; // cantidad fija en combos
              const subtotal = precio * cant;

              return (
                <tr key={id}>
                  <td>
                    <div className="d-flex flex-column">
                      <span className="fw-semibold">{nombre}</span>
                      <small className="text-muted">{formatMoney(precio)} c/u</small>
                    </div>
                  </td>

                  {/* Cantidad fija = 1 */}
                  <td className="text-center">
                    <span className="badge bg-secondary" aria-label="Cantidad fija">
                      1
                    </span>
                  </td>

                  <td className="text-end">
                    <strong>{formatMoney(subtotal)}</strong>
                  </td>

                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleRemove(it)}
                      aria-label={`Quitar "${nombre}" de la lista`}
                      title="Quitar de la lista"
                    >
                      Quitar de la lista
                    </button>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  Selecciona productos de la galería →
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
