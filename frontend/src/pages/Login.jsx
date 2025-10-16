// src/pages/Login.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { validarUsuario, validarContrasena } from '../utils/validations';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import '../styles/modular-login.css';

const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:3001';
const BG_URL = '/img/bg-cinema.jpg';

const isClient = (u) => {
  const roleName = String(u?.rol_nombre || u?.role || '').toUpperCase();
  return u?.isClient === true || roleName === 'CLIENTE' || u?.role_id === 3;
};
const afterLoginRoute = (u) => (isClient(u) ? '/bienvenida-cliente' : '/dashboard');

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  // Limpia alertas
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(''), 3000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  // === Login del personal (usuario/contraseña) ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    const eU = validarUsuario(username);
    const eP = validarContrasena(password);
    if (eU || eP) return setErrorMsg(eU || eP);

    try {
      // ⬇️ Enviar 'usuario' (no 'username')
      const { data } = await axios.post(`${API_BASE}/login`, { usuario: username, password });

      // Flag de primer login con fallback
      const esPrimerLogin =
        data?.es_primer_login ??
        data?.esPrimerLogin ??
        false;

      // Construcción para el contexto
      const userData = {
        username,
        id: data.id,
        role_id: data.role_id,
        rol_nombre: data.rol_nombre,
        es_primer_login: esPrimerLogin,
      };

      // Persistimos token si viene (no forma parte de “recordarme”)
      if (data?.token) localStorage.setItem('mf_token', data.token);

      // Nombre visual (si viene)
      if (data?.nombre || data?.name) {
        localStorage.setItem('mf_user', JSON.stringify({ nombre: data?.nombre || data?.name }));
      }

      // Context auth
      await login(userData);

      // Redirección según es_primer_login (lo trabajado)
      if (esPrimerLogin) {
        navigate('/actualizarcontrasena', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.message || 'Error al conectar con el servidor.');
    }
  };

  // === Login con Google (clientes externos) — SIN cambios fuera de alcance ===
  const handleGoogleSuccess = async (googleResponse) => {
    try {
      const id_token =
        googleResponse?.credential ||
        googleResponse?.idToken ||
        googleResponse?.token;
      if (!id_token) return setErrorMsg('ID Token requerido');

      const payload = { id_token, idToken: id_token, credential: id_token };
      let data;
      try {
        data = (
          await axios.post(`${API_BASE}/api/auth/google`, payload, {
            headers: { 'Content-Type': 'application/json' },
          })
        ).data;
      } catch {
        data = (
          await axios.post(`${API_BASE}/auth/google`, payload, {
            headers: { 'Content-Type': 'application/json' },
          })
        ).data;
      }

      if (!data?.token) return setErrorMsg(data?.message || 'No se recibió un token del servidor.');
      localStorage.setItem('mf_token', data.token);

      if (data?.cliente) {
        localStorage.setItem('mf_cliente', JSON.stringify(data.cliente));
        localStorage.setItem(
          'mf_user',
          JSON.stringify({ nombre: data.cliente?.nombre || data.cliente?.name || 'Cliente' })
        );
      }

      const userData = { id: data?.cliente?.id ?? null, role_id: 3, rol_nombre: 'CLIENTE', isClient: true };
      await login(userData);

      navigate('/bienvenida-cliente', { replace: true });
    } catch {
      setErrorMsg('No se pudo iniciar sesión con Google.');
    }
  };
  const handleGoogleError = () => setErrorMsg('Fallo en autenticación con Google');

  return (
    <>
      {/* ==== Estilos “glass” locales ==== */}
      <style>{`
        :root, html, body, #root { height: 100%; min-height: 100%; overflow-y: auto !important; overflow-x: hidden; }
        body { margin: 0; }

        .pro-bg-fixed{
          position: fixed; inset: 0;
          background-image: linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,.55)), url('${BG_URL}');
          background-size: cover; background-position: center; background-repeat: no-repeat;
          z-index: 0;
        }

        .pro-login-wrap { position: relative; z-index: 1; }
        .pro-screen { min-height: 100vh; width: 100%; display:grid; place-items:center; padding: 24px; }

        .pro-login-card {
          width: min(900px, 94vw);
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,.5);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(10px);
          color:#fff;
        }
        @media (max-width: 960px){ .pro-login-card{ grid-template-columns: 1fr; } }
        @media (max-width: 420px){ .pro-login-card{ width: 96vw; } }

        .pro-form {
          padding: clamp(22px, 4vw, 36px) clamp(18px, 4vw, 28px);
          text-align:center; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center;
          transition: all .3s ease;
        }
        .pro-form.centered { justify-content:center; }

        .pro-section-title{ font-size: clamp(18px, 2.6vw, 24px); font-weight:800; margin-bottom:6px; color:#fff; }
        .pro-section-sub{ font-size: clamp(13px, 2vw, 15px); margin-bottom:18px; color:#e5e7eb; }

        .pro-input{
          width:100%; height:44px; border-radius:10px; border:1px solid #cbd5e1;
          padding:10px 12px; font-size:14px; background:#fff; color:#0f172a; outline:none;
        }
        .pro-btn{
          width:100%; height:44px; border:none; border-radius:12px; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:10px;
          font-weight:800; font-size:14px;
          background:linear-gradient(135deg,#f59e0b,#ef4444);
          color:#fff; margin-top:10px; box-shadow:0 10px 22px rgba(239,68,68,.28);
          transition: transform .12s ease, filter .12s ease;
        }
        .pro-btn:hover{ transform: translateY(-1px); filter:brightness(1.03); }

        .pro-toggle { margin-top:18px; font-size:13px; color:#c7d2fe; cursor:pointer; text-decoration:underline; }
        .pro-staff { margin-top:14px; text-align:left; font-size:13px; animation: slideDown .25s ease; width:100%; max-width:320px; }
        @keyframes slideDown { from {opacity:0; transform:translateY(-8px);} to{opacity:1; transform:translateY(0);} }

        .pro-brand{
          position:relative; padding: clamp(28px, 5vw, 40px) 20px; color:#fff;
          background: rgba(255,255,255,0.08);
          border-left: 1px solid rgba(255,255,255,0.18);
          backdrop-filter: blur(18px);
          display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; overflow:hidden;
        }
        @media (max-width: 960px){ .pro-brand{ border-left: none; border-top: 1px solid rgba(255,255,255,0.18); } }

        .pro-brand-content{ position:relative; z-index:2; display:flex; flex-direction:column; align-items:center; }

        .pro-logo{
          width:92px; height:92px; border-radius:22px;
          background: rgba(255,255,255,.2);
          display:grid; place-items:center; font-size:44px;
          margin-bottom:16px; 
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.35);
          color:#fff;
        }

        .pro-brand h1{ font-size: clamp(28px, 6vw, 44px); font-weight:800; margin:0 0 10px; color:#fff; text-shadow:0 6px 20px rgba(0,0,0,.25); }
        .pro-brand p{ margin: 0 0 16px; font-size: clamp(14px, 2.4vw, 18px); color:#f3f4f6; opacity:.95; max-width: 360px; }

        .pro-list{ display:grid; gap:10px; margin:10px 0 0; padding:0; color:#fff; }
        .pro-list li{ list-style:none; display:flex; align-items:center; gap:10px; font-weight:700; font-size: clamp(14px, 2.6vw, 16px); }

        .pro-deco{ position:absolute; inset:0; z-index:1; pointer-events:none; opacity:.15; }
        .pro-deco i{ position:absolute; font-size:80px; color:#fff; }
        .pro-deco .d1{ top:10%; left:12%; animation: floatY 8s ease-in-out infinite; }
        .pro-deco .d2{ top:65%; left:8%;  animation: floatX 9s ease-in-out infinite; }
        .pro-deco .d3{ top:30%; right:12%; animation: floatY 10s ease-in-out infinite; }
        .pro-deco .d4{ bottom:8%; right:18%; animation: floatX 11s ease-in-out infinite; }

        @keyframes floatY{ 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-18px) rotate(-2deg);} }
        @keyframes floatX{ 0%,100%{ transform: translateX(0);} 50%{ transform: translateX(18px) rotate(2deg);} }

        .pro-alert{
          position: fixed; top:12px; left:50%; transform:translateX(-50%);
          background:#fee2e2; color:#7f1d1d; border:1px solid #fecaca;
          padding:10px 14px; border-radius:12px; z-index: 10; font-weight:700;
          box-shadow:0 10px 24px rgba(0,0,0,.2);
        }

        .pro-forgot { margin-top: 10px; text-align: right; }
        .pro-forgot a { color:#c7d2fe; text-decoration: underline; font-weight: 700; }
      `}</style>

      {errorMsg && <div className="pro-alert">{errorMsg}</div>}

      <div className="pro-bg-fixed" />
      <div className="pro-login-wrap">
        <div className="pro-screen">
          <div className="pro-login-card">
            {/* Sección Cliente */}
            <div className={`pro-form ${!showStaffLogin ? 'centered' : ''}`}>
              <div className="pro-section-title">Inicia sesión con Google</div>
              <div className="pro-section-sub">
                Compra boletos y reserva eventos en minutos.
              </div>

              {/* Botón de Google */}
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />

              {/* Toggle staff */}
              <div className="pro-toggle" onClick={() => setShowStaffLogin(!showStaffLogin)}>
                {showStaffLogin ? 'Ocultar inicio de sesión del personal ▲' : 'Acceso para personal ▼'}
              </div>

              {/* Staff login (colapsable) */}
              {showStaffLogin && (
                <div className="pro-staff">
                  <div style={{fontWeight:'700', marginBottom:8}}>Inicio de sesión para personal</div>
                  <form onSubmit={handleSubmit} autoComplete="on">
                    <div style={{marginBottom:10}}>
                      <input
                        type="text"
                        className="pro-input"
                        placeholder="Usuario"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div style={{marginBottom:10}}>
                      <input
                        type="password"
                        className="pro-input"
                        placeholder="Contraseña"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>

                    <button type="submit" className="pro-btn">
                      <i className="fas fa-sign-in-alt"></i> INGRESAR
                    </button>

                    {/* Enlace: ¿Olvidaste tu contraseña? */}
                    <div className="pro-forgot">
                      <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Panel Glass Branding */}
            <div className="pro-brand">
              <div className="pro-deco">
                <i className="fas fa-film d1"></i>
                <i className="fas fa-ticket-alt d2"></i>
                <i className="fas fa-popcorn d3"></i>
                <i className="fas fa-video d4"></i>
              </div>
              <div className="pro-brand-content">
                <div className="pro-logo"><i className="fas fa-video"></i></div>
                <h1>MovieFlow</h1>
                <p>Tu experiencia cinematográfica comienza aquí.</p>
                <ul className="pro-list">
                  <li><i className="fas fa-film"></i> Estrenos y clásicos</li>
                  <li><i className="fas fa-couch"></i> Comodidad premium</li>
                  <li><i className="fas fa-heart"></i> Momentos inolvidables</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
