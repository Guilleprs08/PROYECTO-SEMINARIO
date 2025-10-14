import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:3001";

const TOOL_VACIO     = 0;
const TOOL_NORMAL    = 1;
const TOOL_PMR       = 2;
const TOOL_DISABLED  = -1;

const tools = [
  { key: TOOL_NORMAL,   label: "Normal",        bg: "#60a5fa", fg: "#fff" },
  { key: TOOL_PMR,      label: "PMR",           bg: "#111827", fg: "#fff" },
  { key: TOOL_DISABLED, label: "Deshabilitado", bg: "#ef4444", fg: "#fff" },
  { key: TOOL_VACIO,    label: "Vacío",         bg: "#f3f4f6", fg: "#111" },
];

export default function SeatDesigner() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [sala, setSala]       = useState(null);
  const [locked, setLocked]   = useState(false); // 🔒 Bloqueo por funciones activas

  const [rows, setRows] = useState(10);
  const [cols, setCols] = useState(15);
  const [firstRow, setFirstRow] = useState("A");
  const [grid, setGrid] = useState(() => Array.from({ length: 10 }, () => Array(15).fill(0)));
  const [tool, setTool] = useState(TOOL_NORMAL);
  const paintRef = useRef({ active: false });

  const API = (path, cfg) => axios({ url: `${API_BASE}${path}`, ...cfg });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Cargamos info de salas para saber si está bloqueada por funciones activas
        try {
          const s = await API(`/api/salas`);
          const salaEncontrada = (s.data || []).find(x => Number(x.id) === Number(id)) || null;
          setSala(salaEncontrada);
          setLocked(Boolean(salaEncontrada?.funcionesActivas > 0)); // 🔒 si hay funciones ACTIVAS
        } catch {}
        // Cargamos asientos actuales
        const { data } = await API(`/api/salas/${id}/asientos`, { method: 'GET' });
        if (Array.isArray(data) && data.length) {
          const letras = [...new Set(data.map(x => (x.fila || x.FILA))).values()].sort();
          const minLetter = letras[0];
          const maxLetter = letras[letras.length - 1];
          const maxCol = Math.max(...data.map(x => Number(x.columna || x.COLUMNA || 0)));
          const r = (maxLetter.charCodeAt(0) - minLetter.charCodeAt(0)) + 1;
          const c = maxCol;
          setRows(r); setCols(c); setFirstRow(minLetter);
          const g = Array.from({ length: r }, () => Array(c).fill(0));
          data.forEach(x => {
            const fila = String(x.fila || x.FILA);
            const col  = Number(x.columna || x.COLUMNA);
            const tipo = String(x.tipo || x.TIPO || "NORMAL");
            const activo = String(x.activo || x.ACTIVO || "S");
            const rr = fila.charCodeAt(0) - minLetter.charCodeAt(0);
            const cc = col - 1;
            // Solo pintamos: activos, o deshabilitados explícitos
            if (activo === "S") g[rr][cc] = (tipo === "PMR" ? TOOL_PMR : TOOL_NORMAL);
            else if (tipo === "DISABLED") g[rr][cc] = TOOL_DISABLED;
          });
          setGrid(g);
        }
      } catch {
        toast.error("No se pudieron cargar los asientos de la sala");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const activos = useMemo(() => grid.flat().filter(v => v === TOOL_NORMAL || v === TOOL_PMR).length, [grid]);
  const deshab  = useMemo(() => grid.flat().filter(v => v === TOOL_DISABLED).length, [grid]);

  const addRow = (where = 'end') => setGrid(g => {
    const copy = g.map(r => [...r]);
    const empty = Array(cols).fill(0);
    if (where === 'start') copy.unshift(empty); else copy.push(empty);
    setRows(copy.length);
    return copy;
  });
  const addCol = (where = 'end') => setGrid(g => {
    const copy = g.map(r => where === 'start' ? [0, ...r] : [...r, 0]);
    setCols(copy[0].length);
    return copy;
  });
  const removeRow = (where = 'end') => setGrid(g => {
    if (g.length <= 1) return g;
    const copy = g.map(r => [...r]);
    if (where === 'start') copy.shift(); else copy.pop();
    setRows(copy.length);
    return copy;
  });
  const removeCol = (where = 'end') => setGrid(g => {
    if (g[0].length <= 1) return g;
    const copy = g.map(r => where === 'start' ? r.slice(1) : r.slice(0, -1));
    setCols(copy[0].length);
    return copy;
  });

  const applyTool = (r, c, t = tool) => setGrid(g => {
    const copy = g.map(row => [...row]);
    copy[r][c] = t;
    return copy;
  });

  const cycleTool = (v) => {
    const order = [TOOL_VACIO, TOOL_NORMAL, TOOL_PMR, TOOL_DISABLED];
    const i = order.indexOf(v);
    return order[(i + 1) % order.length];
  };

  const onMouseDown = (r, c, e) => {
    if (locked) return; // 🔒 no permitir pintar si está bloqueado
    e.preventDefault();
    paintRef.current.active = true;
    applyTool(r, c, e.shiftKey ? cycleTool(grid[r][c]) : tool);
  };
  const onMouseEnter = (r, c) => {
    if (locked) return; // 🔒 no permitir pintar si está bloqueado
    if (paintRef.current.active) applyTool(r, c);
  };
  const onMouseUp = () => { paintRef.current.active = false; };

  const save = async () => {
    try {
      setSaving(true);
      const payload = { primeraFila: firstRow, grid };
      const { data } = await API(`/api/salas/${id}/asientos/replace`, { method: 'POST', data: payload });
      toast.success(`Mapa guardado. Activos: ${data?.activos ?? 0}`);
      navigate('/dashboard/salas');
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo guardar el mapa");
    } finally { setSaving(false); }
  };

  const seatClass = (v) => {
    switch (v) {
      case TOOL_NORMAL:   return "seat seat--normal";
      case TOOL_PMR:      return "seat seat--pmr";
      case TOOL_DISABLED: return "seat seat--disabled";
      default:            return "seat seat--empty";
    }
  };
  const letter = (i) => String.fromCharCode(firstRow.charCodeAt(0) + i);

  if (loading) return <div className="container py-5 text-muted">Cargando editor…</div>;

  return (
    <div className="container-fluid py-4" onMouseUp={onMouseUp}>
      <style>{`
        :root { --seat-size: 40px; --gap: 6px; }
        .legend-btn { display:inline-flex; align-items:center; gap:.5rem; }
        .legend-dot { display:inline-block; width:12px; height:12px; border-radius:2px; }
        .canvas { display:flex; justify-content:center; }
        .grid-wrap { display:inline-block; }
        .grid { display:grid; grid-template-columns: 40px repeat(var(--cols), var(--seat-size)); gap: var(--gap); }
        .col-head, .row-head { color:#6b7280; font-size:.85rem; }
        .row-head { line-height: var(--seat-size); width:40px; text-align:right; font-weight:600; }
        .seat {
          width: var(--seat-size);
          height: var(--seat-size);
          border-radius: 10px;
          border: 1px solid #d1d5db;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          transition: transform .08s ease, box-shadow .12s ease;
          box-shadow: 0 1px 0 rgba(0,0,0,.05);
        }
        .seat:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.12); }
        .seat--normal   { background:#60a5fa; color:#fff; }
        .seat--pmr      { background:#111827; color:#fff; }
        .seat--disabled { background:#ef4444; color:#fff; }
        .seat--empty    { background:#f3f4f6; color:#111; }
        .screen-grid { display:grid; grid-template-columns: 40px repeat(var(--cols), var(--seat-size)); gap: var(--gap); }
        .screen-bar { height:8px; background:#e5e7eb; border-radius:4px; grid-column: 2 / -1; }
      `}</style>

      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div className="d-flex align-items-center gap-3">
          <h4 className="m-0">Editor avanzado — {sala?.nombre || `Sala ${id}`}</h4>
          <span className="badge bg-light text-dark">{rows}×{cols}</span>
          <span className="badge bg-primary">Activos: {activos}</span>
          <span className="badge bg-danger">Deshabilitados: {deshab}</span>
        </div>
        <div className="d-flex align-items-center flex-wrap gap-2">
          {tools.map(t => (
            <button
              key={t.key}
              className={`btn btn-sm ${tool === t.key ? 'btn-dark' : 'btn-outline-dark'} legend-btn`}
              onClick={() => setTool(t.key)}
              title={t.label === 'PMR' ? 'Asiento accesible (Personas con Movilidad Reducida)' : t.label}
              disabled={locked} // 🔒 no cambiar herramienta si está bloqueado
            >
              <span className="legend-dot" style={{ background:t.bg }} />
              {t.label}
            </button>
          ))}
          <button className="btn btn-outline-secondary btn-sm" onClick={()=>navigate('/dashboard/salas')}>Cancelar</button>
          <button className="btn btn-primary btn-sm" disabled={saving || locked} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Aviso de bloqueo */}
      {locked && (
        <div className="alert alert-warning d-flex align-items-center" role="alert">
          <i className="fas fa-lock me-2"></i>
          No se puede editar el mapa: la sala tiene funciones <b className="ms-1">ACTIVAS</b> asignadas.
        </div>
      )}

      {/* Controles de filas/columnas */}
      <div className="d-flex align-items-center gap-2 mb-2">
        <label className="form-label m-0 me-2">Primera fila</label>
        <input
          className="form-control form-control-sm"
          style={{ width: 60 }}
          value={firstRow}
          maxLength={1}
          onChange={(e)=> setFirstRow((e.target.value || 'A').toUpperCase().slice(0,1))}
          disabled={locked} // 🔒
        />
        <div className="vr mx-1" />
        <button className="btn btn-outline-secondary btn-sm" onClick={() => addRow('start')} disabled={locked}>+ Fila arriba</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => addRow('end')} disabled={locked}>+ Fila abajo</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => removeRow('end')} disabled={locked}>− Quitar fila</button>
        <div className="vr mx-1" />
        <button className="btn btn-outline-secondary btn-sm" onClick={() => addCol('start')} disabled={locked}>+ Col. izq</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => addCol('end')} disabled={locked}>+ Col. der</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => removeCol('end')} disabled={locked}>− Quitar col.</button>
      </div>

      {/* GRID centrado (fila A arriba) */}
      <div className="canvas" style={locked ? { pointerEvents:'none', opacity:.6 } : {}}>
        <div className="grid-wrap" style={{ '--cols': cols }}>
          <div className="grid">
            <div />
            {Array.from({ length: cols }).map((_, c) => (
              <div key={`ch-${c}`} className="text-center col-head">{c+1}</div>
            ))}
            {Array.from({ length: rows }).map((_, r) => (
              <React.Fragment key={`r-${r}`}>
                <div className="row-head">{letter(r)}</div>
                {Array.from({ length: cols }).map((_, c) => {
                  const v = grid[r][c];
                  return (
                    <button
                      key={`cell-${r}-${c}`}
                      type="button"
                      className={seatClass(v)}
                      onMouseDown={(e)=>onMouseDown(r,c,e)}
                      onMouseEnter={(e)=>onMouseEnter(r,c,e)}
                      title={`${letter(r)}-${c+1}${v===TOOL_PMR?' (PMR)':''}`}
                    >
                      {v === TOOL_PMR ? <i className="fas fa-wheelchair" /> : (v === TOOL_VACIO ? '' : <i className="fas fa-chair" />)}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Pantalla ABAJO, alineada con las butacas */}
          <div className="mt-4" />  {/* separador */}
          <div className="text-center text-muted mb-2">Pantalla</div>
          <div className="screen-grid" style={{ '--cols': cols }}>
            <div /> {/* columna de letras */}
            <div className="screen-bar" />
          </div>
        </div>
      </div>

      <div className="mt-3 small text-muted text-center">
        Tips: clic pinta con la herramienta seleccionada · SHIFT+clic alterna (Vacío → Normal → PMR → Deshabilitado) ·
        Arrastra para pintar rápido · “Vacío” crea pasillos.
      </div>
    </div>
  );
}
