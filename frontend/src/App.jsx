// src/App.jsx
import React, { useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
  if (loading) return <div>Cargando...</div>;
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  return !user ? children : <Navigate to={defaultAfterLoginRoute(user)} replace />;
};

const ClientRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return isClient(user) ? children : <Navigate to="/dashboard" replace />;
};

/* Solo Admin/Empleado (no clientes) */
const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return !isClient(user) ? children : <Navigate to="/bienvenida-cliente" replace />;
};

const HomeRedirect = () => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Cargando...</div>;
  const to = user ? defaultAfterLoginRoute(user) : '/login';
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
