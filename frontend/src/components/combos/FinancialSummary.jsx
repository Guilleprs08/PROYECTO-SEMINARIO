// src/components/combos/FinancialSummary.jsx
import React from "react";

/** Formatea a Quetzales (GTQ) con locale es-GT */
const formatMoney = (n) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(n || 0));

/**
 * Props:
 *  - suma: number|string  -> suma de precios de los items del combo
 *  - precioCombo: number|string
 *  - ahorro?: number|string (opcional; si viene, se ignora y se recalcula para consistencia)
 *  - onCancel?: () => void
 *  - onSave?: () => void
 */
export default function FinancialSummary({
  suma,
  precioCombo,
  ahorro, // eslint-disable-line no-unused-vars
  onCancel,
  onSave,
}) {
  const totalComponentes = Number(suma || 0);
  const precio = Number(precioCombo || 0);
  // cálculo consistente de ahorro (positivo => hay ahorro)
  const ahorroCalc = totalComponentes - precio;

  const handleCancel = () => (typeof onCancel === "function" ? onCancel() : null);
  const handleSave = () => (typeof onSave === "function" ? onSave() : null);

  return (
    <section className="card gradient-box mb-3">
      <div className="card-body">
        <div className="d-flex justify-content-between">
          <span>Suma de componentes</span>
          <strong>{formatMoney(totalComponentes)}</strong>
        </div>
        <div className="d-flex justify-content-between">
          <span>Precio del combo</span>
          <strong>{formatMoney(precio)}</strong>
        </div>
        <div className="d-flex justify-content-between">
          <span>Ahorro estimado</span>
          <strong className={ahorroCalc > 0 ? "text-success" : "text-danger"}>
            {formatMoney(ahorroCalc)}
          </strong>
        </div>
      </div>

      <div className="card-footer d-flex gap-2 justify-content-end">
        <button className="btn btn-outline-secondary" onClick={handleCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          Guardar combo
        </button>
      </div>
    </section>
  );
}
