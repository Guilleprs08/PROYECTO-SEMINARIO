import React, { useState, useEffect, memo, useContext } from "react";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import "../../styles/actualizar-contrasena.css"; // ⬅️ CSS externo

const BG_URL = "/img/bg-cinema.jpg";

/* ====== Input con botón de mostrar/ocultar (memoizado) ====== */
const InputConOjo = memo(function InputConOjo({
  label,
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
  autoFocus = false,
}) {
  return (
    <div className="mb-4">
      <label className="form-label text-white-90">{label}</label>
      <div className="input-group">
        <input
          type={shown ? "text" : "password"}
          className="form-control pro-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="input-group-text btn btn-outline-secondary pro-eye-btn"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggle}
          aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
          tabIndex={-1}
        >
          {shown ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
    </div>
  );
});

export default function ActualizarContrasena() {
  const navigate = useNavigate();
  const { login, user } = useContext(AuthContext);

  // Campos
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");

  // Mostrar/ocultar
  const [showActual, setShowActual] = useState(false);
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  // Alerta inicial
  const [mostrarAlerta, setMostrarAlerta] = useState(true);
  const [redirigiendo, setRedirigiendo] = useState(false);

  // Guard local: si YA no es primer login, no renderizar esta vista
  useEffect(() => {
    const store = localStorage.getItem("userData") ? localStorage : sessionStorage;
    const raw = store.getItem("userData");
    const data = raw ? JSON.parse(raw) : null;
    const flag =
      data?.es_primer_login ?? data?.esPrimerLogin ?? user?.es_primer_login ?? user?.esPrimerLogin;

    if (flag === false) {
      setRedirigiendo(true);
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user]);

  // Reglas de contraseña
  const validarNueva = (pwd) => {
    const reglas = [
      { ok: pwd.length >= 8, msg: "La contraseña debe tener al menos 8 caracteres." },
      { ok: /[A-Z]/.test(pwd), msg: "Debe incluir al menos una letra mayúscula." },
      { ok: /[a-z]/.test(pwd), msg: "Debe incluir al menos una letra minúscula." },
      { ok: /[0-9]/.test(pwd), msg: "Debe incluir al menos un número." },
      { ok: /[!@#$%^&*]/.test(pwd), msg: "Debe incluir al menos un carácter especial (!@#$%^&*)." },
    ];
    const errores = reglas.filter((r) => !r.ok).map((r) => r.msg);
    return { esValida: errores.length === 0, errores };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!actual || !nueva || !confirmar) {
      toast.warning("Completa todos los campos.");
      return;
    }

    const { esValida, errores } = validarNueva(nueva);
    if (!esValida) {
      errores.forEach((m) => toast.error(m));
      return;
    }

    if (nueva === actual) {
      toast.error("La nueva contraseña no puede ser igual a la actual.");
      return;
    }

    if (nueva !== confirmar) {
      toast.error("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    try {
      const usuarioId =
        Number(user?.id) ||
        Number(localStorage.getItem("usuario_id")) ||
        Number(sessionStorage.getItem("usuario_id"));

      if (!usuarioId) {
        toast.error("No se encontró la sesión del usuario. Inicia sesión nuevamente.");
        return;
      }

      await axios.post("http://localhost:3001/login/primer-cambio", {
        usuarioId,
        actualPassword: actual,
        nuevaPassword: nueva,
      });

      const store = localStorage.getItem("userData") ? localStorage : sessionStorage;
      const raw = store.getItem("userData");
      if (raw) {
        const data = JSON.parse(raw);
        data.es_primer_login = false;
        data.esPrimerLogin = false;
        store.setItem("userData", JSON.stringify(data));
        await login({ ...(user || {}), ...data });
      }

      toast.success("Contraseña cambiada correctamente.");
      setMostrarAlerta(false);
      setActual("");
      setNueva("");
      setConfirmar("");

      setRedirigiendo(true);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || "No se pudo cambiar la contraseña.";
      toast.error(msg);
      const errs = err?.response?.data?.errores;
      if (Array.isArray(errs)) errs.forEach((m) => toast.error(m));
    }
  };

  if (redirigiendo) return null;

  return (
    <>
      <div
        className="pro-bg-fixed"
        style={{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,.55)), url('${BG_URL}')` }}
      />
      <div className="pro-screen">
        <div className="pro-login-card">
          <div className="pro-form">
            <div className="pro-title">
              <FiLock size={28} />
              <h2 className="m-0">Cambiar Contraseña</h2>
            </div>
            <p className="pro-sub">Primer inicio de sesión</p>

            {mostrarAlerta && (
              <div className="alert alert-info pro-info">
                Por seguridad, debes cambiar tu contraseña temporal antes de continuar.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <InputConOjo
                label="Contraseña Actual"
                value={actual}
                onChange={setActual}
                shown={showActual}
                onToggle={() => setShowActual((v) => !v)}
                autoComplete="current-password"
                autoFocus
              />
              <InputConOjo
                label="Nueva Contraseña"
                value={nueva}
                onChange={setNueva}
                shown={showNueva}
                onToggle={() => setShowNueva((v) => !v)}
                autoComplete="new-password"
              />
              <InputConOjo
                label="Confirmar Nueva Contraseña"
                value={confirmar}
                onChange={setConfirmar}
                shown={showConfirmar}
                onToggle={() => setShowConfirmar((v) => !v)}
                autoComplete="new-password"
              />

              <button type="submit" className="pro-btn">
                Cambiar Contraseña
              </button>
            </form>
          </div>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={3500} newestOnTop />
    </>
  );
}
