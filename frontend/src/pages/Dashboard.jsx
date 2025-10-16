// src/pages/Dashboard.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import TipoCambioBadge from '../components/TipoCambioBadge';

// ====== Vistas existentes ======
import RegistrarUsuario from './RegistrarUsuario';
import AsignarModulos from './AsignarModulos';
import AsignarFunciones from './AsignarFunciones';
import CrearCategorias from './CrearCategorias';
import RegistrarClasificacion from './RegistrarClasificacion';
import AgregarNuevaPelicula from './AgregarNuevaPelicula';
import Categorias from './Categorias';
import UnidadMedida from './UnidadMedida';
import Productos from './Productos';
import GestionarSalas from './GestionarSalas';
import VentaDeEntradas from './VentaDeEntradas';
import HistorialVentaEntradas from './HistorialVentaEntradas';
import HistorialReservas from './HistorialReservas';
import ReservasDelDia from './ReservasDelDia';
import SolicitudesReservas from './SolicitudesReservas';
import SnacksCaja from './SnacksCaja';

// ====== Vistas IBER ======
import CrearNuevaVenta from "../pages/vista personal de ventas/CrearNuevaVenta";
import AperturaCaja from "../pages/vista personal de ventas/AperturaCaja";
import CierreDeCaja from "../pages/cierre-de-caja/CierreDeCaja";
import ResumendeVentas from "./ResumendeVentas";
import NuevoCombo from "../pages/Combos/NuevoCombo";
import lotes from './lotes';
import Reportes_de_Sala from "../pages/graficas_reportes/Reportes_de_Sala";
import ReporteventasCategoria from "../pages/graficas_reportes/ReporteventasCategoria";

import '../styles/dashboard.css';

/* ====== NUEVAS IMPORTACIONES (funcionalidades extraídas) ====== */
import ReservaConfirmada from './reservaConfirmada';
import DasboarddeGraficas from './DasboarddeGraficas';

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

/* ========================= Helpers ========================= */
const formatoTitulo = (texto) =>
  !texto ? '' : String(texto).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

const keyfy = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

/* ============================ Dashboard ============================ */
const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [modulesData, setModulesData] = useState([]);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState(null);

  // Tipo de cambio
  const [tc, setTc] = useState({ ref: null, loading: true });
  useEffect(() => {
    let cancel = false;
    const fetchTC = async () => {
      try {
        const { data } = await client.get('/api/tipo-cambio/hoy');
        const ref = (data?.referencia && !isNaN(data.referencia)) ? Number(data.referencia).toFixed(2) : null;
        if (!cancel) setTc({ ref, loading: false });
      } catch {
        if (!cancel) setTc({ ref: null, loading: false });
      }
    };
    fetchTC();
    const id = setInterval(fetchTC, 3 * 60 * 60 * 1000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // === CARGA SOLO DESDE BD/API (sin menú quemado) ===
  useEffect(() => {
    const loadMenu = async () => {
      if (!user?.role_id) return;
      try {
        const { data } = await client.get(`/api/menu/${user.role_id}`);
        setModulesData(Array.isArray(data) ? data : []);
      } catch {
        setModulesData([]);
      }
    };
    loadMenu();
  }, [user]);

  // Mapeo submódulo -> componente (esto NO es menú; es resolución de vista)
  const submoduloComponents = {
    registrar_usuarios: RegistrarUsuario,
    asignacion_de_modulos: AsignarModulos,
    asignar_funciones: AsignarFunciones,
    crear_categoria: CrearCategorias,
    crear_clasificacion: RegistrarClasificacion,
    agregar_nueva_pelicula: AgregarNuevaPelicula,
    gestionar_salas: GestionarSalas,
    historial_de_reservas: HistorialReservas,
    reserva_del_dia: ReservasDelDia,
    ver_solicitudes: SolicitudesReservas,
    nueva_categoria: Categorias,
    crear_unidad_de_medida: UnidadMedida,
    agregar_nuevo_producto: Productos,
    crear_nuevo_lote: lotes,
    nuevo_combo: NuevoCombo,
    crear_nueva_venta: CrearNuevaVenta,
    apertura_de_caja: AperturaCaja,
    cierre_de_caja: CierreDeCaja,
    pedidos_de_snack: SnacksCaja,
    resumen_de_ventas: ResumendeVentas,
    venta_de_entradas: VentaDeEntradas,
    historial_venta_de_entradas: HistorialVentaEntradas,
    reportes_de_sala: Reportes_de_Sala,
    ventas_por_categoria: ReporteventasCategoria,

    // ❌ Se mantienen fuera las claves relacionadas con dashboarddecategorias.
  };

  const resolveSubmoduleComponent = (sub) =>
    sub
      ? (submoduloComponents[keyfy(sub.name)] || submoduloComponents[keyfy(sub.route)])
      : null;

  const toggleModule = (id) => {
    setExpandedModuleId(expandedModuleId === id ? null : id);
    setSelectedSubmoduleId(null);
  };
  const handleSubmoduleClick = (id) => setSelectedSubmoduleId(id);
  const handleLogout = () => { localStorage.clear(); logout(); };

  const selectedModule = modulesData.find((m) => m.id === expandedModuleId);
  const selectedSubmodule = selectedModule?.submodulos?.find((s) => s.id === selectedSubmoduleId) || null;

  // Fallback para mostrar el rol siempre
  const storedUser = JSON.parse(localStorage.getItem('userData') || sessionStorage.getItem('userData') || '{}');
  const roleName = user?.rol_nombre || storedUser?.rol_nombre || '';

  return (
    <div className="dashboard-container">
      {/* Barra de tipo de cambio */}
      <div
        style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, maxWidth: '90%', whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', background: 'rgba(255,255,255,0.8)', border: '1px solid #e5e7eb',
          boxShadow: '0 4px 10px rgba(0,0,0,0.08)', padding: '8px 14px', borderRadius: 12,
          fontSize: 14, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(6px)',
        }}
        title="Tipo de cambio de referencia del Banguat"
      >
        <strong>Cambio de dólares a quetzales:</strong>
        <span>{tc.loading ? 'Cargando…' : (tc.ref ? `Q ${tc.ref}` : 'No disponible')}</span>
      </div>

      {/* Topbar con rol + botón salir */}
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="topbar-title">
            Bienvenido al sistema : <span className="topbar-role">{roleName}</span>
          </h1>
          <button className="logout-btn" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>

      <Sidebar
        modulesData={modulesData}
        expandedModuleId={expandedModuleId}
        onToggleModule={toggleModule}
        selectedSubmoduleId={selectedSubmoduleId}
        onSelectSubmodule={handleSubmoduleClick}
      />

      <main className="main-content">
        {selectedSubmodule ? (
          (() => {
            const SubComp = resolveSubmoduleComponent(selectedSubmodule);
            return SubComp ? (
              <SubComp idAdmin={user?.id} />
            ) : (
              <>
                <h2>{formatoTitulo(selectedSubmodule.name)}</h2>
                <p>Vista sin contenido.</p>
              </>
            );
          })()
        ) : (
          <div className="dashboard-compact">
            {/* ===== Fila superior: ReservaConfirmada ocupa 100% ===== */}
            <div className="charts-row-50">
              {user?.role_id === 1 && (
                <section className="reserva-confirmada" style={{ gridColumn: '1 / -1' }}>
                  <ReservaConfirmada />
                </section>
              )}
            </div>

            {/* ===== Debajo: otras gráficas (solo admin) ===== */}
            {user?.role_id === 1 && <DasboarddeGraficas />}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
