// src/App.jsx
import React, { useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthContext, AuthProvider } from './contexts/AuthContext';
import './styles/fonts.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DashboardCliente from './pages/DashboardCliente';
import SeatDesigner from './pages/SeatDesigner';
import WelcomeCliente from './pages/WelcomeCliente';
import ReservaEvento from './pages/ReservaEvento';
import MisReservas from './pages/MisReservas';
import SolicitudesReservas from './pages/SolicitudesReservas';
import MisSolicitudes from './pages/MisSolicitudes';
import ReservasDelDia from './pages/ReservasDelDia';
import Snacks from './pages/Snacks';
import MisPedidosSnacks from './pages/MisPedidosSnacks';

// 👇 NUEVO: Panel de caja para snacks (empleados/admin)
import SnacksCaja from './pages/SnacksCaja';

// 👇 NUEVO: Ruta para primer cambio de contraseña
import ActualizarContrasena from './pages/actualizarcontrasena/actualizarContrasena';

// ⬇️ NUEVO: Vistas públicas para recuperación de contraseña
import RecuperacionDeContrasena from './pages/recuperacion de contrasena/recuperaciondeContrasena';
import ValidacionDeCodigo from './pages/recuperacion de contrasena/validaciondeCodigo';

/* ================= Helpers de roles/rutas ================= */
const isClient = (u) => {
  const roleName = String(u?.rol_nombre || u?.role || '').toUpperCase();
  return (
    u?.isClient === true ||
    roleName === 'CLIENTE' ||
    u?.role_id === 3
  );
};

const defaultAfterLoginRoute = (u) => (isClient(u) ? '/bienvenida-cliente' : '/dashboard');

/* ================= Guards ================= */
const PrivateRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation(); // 👈 agregado para permitir /actualizarcontrasena
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // ⬇️ Lógica solicitada: si es primer login, forzar a /actualizarcontrasena (pero permitir si ya estás ahí)
  const esPrimer = user?.es_primer_login ?? user?.esPrimerLogin ?? false;
  if (esPrimer && location.pathname !== '/actualizarcontrasena') {
    return <Navigate to="/actualizarcontrasena" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return children;

  // ⬇️ Si ya hay sesión, decidir destino según primer login
  const esPrimer = user?.es_primer_login ?? user?.esPrimerLogin ?? false;
  return <Navigate to={esPrimer ? '/actualizarcontrasena' : defaultAfterLoginRoute(user)} replace />;
};

const ClientRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // ⬇️ Bloqueo por primer login
  const esPrimer = user?.es_primer_login ?? user?.esPrimerLogin ?? false;
  if (esPrimer) return <Navigate to="/actualizarcontrasena" replace />;

  return isClient(user) ? children : <Navigate to="/dashboard" replace />;
};

/* Solo Admin/Empleado (no clientes) */
const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // ⬇️ Bloqueo por primer login
  const esPrimer = user?.es_primer_login ?? user?.esPrimerLogin ?? false;
  if (esPrimer) return <Navigate to="/actualizarcontrasena" replace />;

  return !isClient(user) ? children : <Navigate to="/bienvenida-cliente" replace />;
};

const HomeRedirect = () => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  // ⬇️ Redirección por primer login
  const esPrimer = user?.es_primer_login ?? user?.esPrimerLogin ?? false;
  const to = esPrimer ? '/actualizarcontrasena' : defaultAfterLoginRoute(user);
  return <Navigate to={to} replace />;
};

/* ================= App ================= */
function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Público */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* ⬇️ NUEVO: Recuperación de contraseña (públicas) */}
        <Route
          path="/recuperar"
          element={
            <PublicRoute>
              <RecuperacionDeContrasena />
            </PublicRoute>
          }
        />
        <Route
          path="/validacion-codigo"
          element={
            <PublicRoute>
              <ValidacionDeCodigo />
            </PublicRoute>
          }
        />

        {/* 👇 NUEVO: Primer cambio de contraseña (privado) */}
        <Route
          path="/actualizarcontrasena"
          element={
            <PrivateRoute>
              <ActualizarContrasena />
            </PrivateRoute>
          }
        />

        {/* Editor avanzado de asientos (privado) */}
        <Route
          path="/dashboard/salas/:id/disenio"
          element={
            <PrivateRoute>
              <SeatDesigner />
            </PrivateRoute>
          }
        />

        {/* Dashboard admin (privado) */}
        <Route
          path="/dashboard/*"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />

        {/* Solicitudes de Reserva (ADMIN/EMPLEADO) */}
        <Route
          path="/solicitudes"
          element={
            <AdminRoute>
              <SolicitudesReservas />
            </AdminRoute>
          }
        />

        {/* Reservas del día (empleados/caja) */}
        <Route
          path="/reservas/dia"
          element={
            <PrivateRoute>
              <ReservasDelDia />
            </PrivateRoute>
          }
        />

        {/* 👇 NUEVO: Panel de caja para snacks (ADMIN/EMPLEADO) */}
        <Route
          path="/caja/snacks"
          element={
            <AdminRoute>
              <SnacksCaja />
            </AdminRoute>
          }
        />

        {/* Bienvenida cliente */}
        <Route
          path="/bienvenida-cliente"
          element={
            <ClientRoute>
              <WelcomeCliente />
            </ClientRoute>
          }
        />

        {/* Cartelera cliente */}
        <Route
          path="/dashboard-cliente"
          element={
            <ClientRoute>
              <DashboardCliente />
            </ClientRoute>
          }
        />

        {/* Reserva de evento */}
        <Route
          path="/reservar-evento"
          element={
            <ClientRoute>
              <ReservaEvento />
            </ClientRoute>
          }
        />

        {/* Mis reservas */}
        <Route
          path="/mis-reservas"
          element={
            <ClientRoute>
              <MisReservas />
            </ClientRoute>
          }
        />

        {/* Mis solicitudes */}
        <Route
          path="/mis-solicitudes"
          element={
            <ClientRoute>
              <MisSolicitudes />
            </ClientRoute>
          }
        />

        {/* Snacks */}
        <Route
          path="/snacks"
          element={
            <ClientRoute>
              <Snacks />
            </ClientRoute>
          }
        />

        {/* Mis pedidos de snacks (cliente) */}
        <Route
          path="/mis-pedidos-snacks"
          element={
            <ClientRoute>
              <MisPedidosSnacks />
            </ClientRoute>
          }
        />

        {/* Root -> decide según sesión/rol */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
