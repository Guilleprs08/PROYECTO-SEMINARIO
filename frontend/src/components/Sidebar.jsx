// src/components/Sidebar.jsx
import React from "react";

/** Igual que en Dashboard: convierte a título legible */
const formatoTitulo = (texto) =>
  !texto ? "" : String(texto).replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Sidebar de módulos y submódulos
 * - modulesData: Array de módulos { id, name, icon, submodulos: [{ id, name, route, icon }] }
 * - expandedModuleId: ID del módulo actualmente expandido
 * - onToggleModule: fn(id) => expandir/colapsar módulo
 * - selectedSubmoduleId: ID del submódulo seleccionado
 * - onSelectSubmodule: fn(id) => seleccionar submódulo
 *
 * Nota: No altera la estructura; solo renderiza lo que ya tenías.
 */
export default function Sidebar({
  modulesData = [],
  expandedModuleId = null,
  onToggleModule = () => {},
  selectedSubmoduleId = null,
  onSelectSubmodule = () => {},
}) {
  return (
    <nav className="sidebar">
      <h3>Menu</h3>
      <ul>
        {modulesData.map((mod) => (
          <li key={mod.id}>
            <div
              className={`menu-module ${expandedModuleId === mod.id ? "expanded active" : ""}`}
              onClick={() => onToggleModule(mod.id)}
              role="button"
              tabIndex={0}
            >
              {/* Icono si viene */}
              {mod.icon ? (
                <i className={`fas ${mod.icon}`} style={{ marginRight: 8 }} aria-hidden />
              ) : (
                <span style={{ marginRight: 8 }} />
              )}
              {formatoTitulo(mod.name)}
            </div>

            {expandedModuleId === mod.id && Array.isArray(mod.submodulos) && mod.submodulos.length > 0 && (
              <ul className="submenu">
                {mod.submodulos.map((sub) => (
                  <li
                    key={sub.id}
                    className={`submodulo-item ${sub.id === selectedSubmoduleId ? "active" : ""}`}
                    onClick={() => onSelectSubmodule(sub.id)}
                    role="button"
                    tabIndex={0}
                    title={sub.route ? sub.route : sub.name}
                  >
                    {sub.icon ? (
                      <i className={`fas ${sub.icon}`} style={{ marginRight: 6 }} aria-hidden />
                    ) : (
                      <span style={{ marginRight: 6 }} />
                    )}
                    {formatoTitulo(sub.name)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
