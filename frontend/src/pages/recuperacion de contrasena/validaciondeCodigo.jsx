// src/pages/recuperacion de contrasena/validaciondeCodigo.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useLocation, useNavigate } from "react-router-dom";
import { FiClock, FiEye, FiEyeOff, FiRefreshCw, FiShield } from "react-icons/fi";
import "../../styles/actualizar-contrasena.css"; // ✅ Reutilizamos el mismo CSS

const BG_URL = "/img/bg-cinema.jpg";

/* === Input de contraseña con botón de mostrar/ocultar (sin cambiar lógica) === */
const PasswordInput = ({
  label,
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
  isInvalid,
  invalidMsg,
}) => (
  <div className="mb-3">
    <label className="form-label text-white-90">{label}</label>
    <div className="input-group">
      <input
        type={shown ? "text" : "password"}
        className={`form-control pro-input ${isInvalid ? "is-invalid" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="input-group-text btn btn-outline-secondary pro-eye-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        tabIndex={-1}
        aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {shown ? <FiEyeOff /> : <FiEye />}
      </button>
      {isInvalid && <div className="invalid-feedback">{invalidMsg}</div>}
    </div>
  </div>
);

export default function ValidacionDeCodigo() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const [identificador, setIdentificador] = useState(state.identificador);
  const [expiresAt, setExpiresAt] = useState(state.expiresAt || (Date.now() + 60_000));

  // 6 inputs de código
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputsRef = useRef([]);

  // contraseñas
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);

  // errores visuales
  const [errors, setErrors] = useState({ code: "", pwd: "", pwd2: "" });

  // estados UI
  const [cambiando, setCambiando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    if (!identificador) {
      navigate("/recuperar", { replace: true });
    }
  }, [identificador, navigate]);

  // Timer
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, expiresAt - now);
  const remaining = {
    mm: String(Math.floor(remainingMs / 1000 / 60)).padStart(2, "0"),
    ss: String(Math.floor((remainingMs / 1000) % 60)).padStart(2, "0"),
  };
  const isExpiring = remainingMs <= 5_000 && remainingMs > 0;
  const isExpired = remainingMs === 0;

  const validarPwd = (p) => {
    const reglas = [
      { ok: p.length >= 8, msg: "Debe tener al menos 8 caracteres." },
      { ok: /[A-Z]/.test(p), msg: "Debe incluir al menos una mayúscula." },
      { ok: /[a-z]/.test(p), msg: "Debe incluir al menos una minúscula." },
      { ok: /[0-9]/.test(p), msg: "Debe incluir al menos un número." },
      { ok: /[!@#$%^&*]/.test(p), msg: "Debe incluir al menos un carácter especial (!@#$%^&*)." },
    ];
    const errores = reglas.filter(r => !r.ok).map(r => r.msg);
    return { esValida: errores.length === 0, errores };
  };

  // Auto-avance, backspace y pegado
  const handleDigitChange = (idx, val) => {
    const v = val.replace(/\D/g, "").slice(0, 1);
    const next = [...code];
    next[idx] = v;
    setCode(next);
    if (errors.code) setErrors((e) => ({ ...e, code: "" }));
    if (v && idx < 5) inputsRef.current[idx + 1]?.focus();
  };
  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      const next = [...code];
      next[idx - 1] = "";
      setCode(next);
      inputsRef.current[idx - 1]?.focus();
      e.preventDefault();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputsRef.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) inputsRef.current[idx + 1]?.focus();
  };
  const handlePaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const arr = text.split("");
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < arr.length; i++) next[i] = arr[i];
    setCode(next);
    if (errors.code) setErrors((e) => ({ ...e, code: "" }));
    const focusIndex = Math.min(arr.length, 5);
    inputsRef.current[focusIndex]?.focus();
    e.preventDefault();
  };

  const codeValue = useMemo(() => code.join(""), [code]);

  const handleCambiar = async (e) => {
    e.preventDefault();

    let hasError = false;
    const newErrors = { code: "", pwd: "", pwd2: "" };

    if (codeValue.length !== 6) {
      newErrors.code = "Ingresa los 6 dígitos del código.";
      hasError = true;
    }
    if (!pwd.trim()) {
      newErrors.pwd = "La nueva contraseña es obligatoria.";
      hasError = true;
    }
    if (!pwd2.trim()) {
      newErrors.pwd2 = "La confirmación es obligatoria.";
      hasError = true;
    }

    setErrors(newErrors);
    if (hasError) {
      toast.warn("Completa los campos obligatorios.");
      return;
    }

    if (isExpired) {
      toast.error("Código expirado. Reenvíalo para continuar.");
      return;
    }

    if (pwd !== pwd2) {
      setErrors((e) => ({ ...e, pwd2: "La confirmación no coincide." }));
      toast.error("La confirmación no coincide.");
      return;
    }

    const { esValida, errores } = validarPwd(pwd);
    if (!esValida) {
      errores.forEach((m) => toast.error(m));
      return;
    }

    try {
      setCambiando(true);
      await axios.post("http://localhost:3001/password/reset", {
        identificador,
        code: codeValue,
        newPassword: pwd, // el backend espera 'newPassword'
      });
      toast.success("Contraseña cambiada correctamente.");
      setTimeout(() => navigate("/login", { replace: true }), 600);
    } catch (err) {
      const msg = err?.response?.data?.message || "No se pudo cambiar la contraseña.";
      toast.error(msg);
      const errs = err?.response?.data?.errores;
      if (Array.isArray(errs)) errs.forEach((m) => toast.error(m));
    } finally {
      setCambiando(false);
    }
  };

  const handleReenviar = async () => {
    try {
      setReenviando(true);
      const { data } = await axios.post("http://localhost:3001/password/resend", {
        identificador,
      });
      const ttl = Number(data?.ttl ?? 60);
      setExpiresAt(Date.now() + ttl * 1000);
      setCode(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
      setPwd("");
      setPwd2("");
      setErrors({ code: "", pwd: "", pwd2: "" });
      toast.info("Se envió un nuevo código. Revisa tu correo.");
    } catch (err) {
      const msg = err?.response?.data?.message || "No se pudo reenviar el código.";
      toast.error(msg);
    } finally {
      setReenviando(false);
    }
  };

  return (
    <>
      {/* Fondo y layout tipo glass (igual al de ActualizarContrasena) */}
      <div
        className="pro-bg-fixed"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,.55)), url('${BG_URL}')`,
        }}
      />

      <div className="pro-screen">
        <div className="pro-login-card">
          <div className="pro-form">
            <div className="pro-title d-flex align-items-center gap-2" style={{ marginBottom: 4 }}>
              <FiShield size={26} />
              <h2 className="m-0">Verificar código</h2>
            </div>
            <p className="pro-sub">
              Ingresa el código de 6 dígitos enviado a tu correo y define tu nueva contraseña.
            </p>

            {/* Timer */}
            <div
              className="d-inline-flex align-items-center gap-2 mb-3 px-3 py-2 rounded pro-info"
              style={{
                border: "1px solid rgba(255,255,255,.25)",
                color: isExpiring ? "#ff6b6b" : undefined,
              }}
            >
              <FiClock />
              <strong style={{ color: isExpiring ? "red" : undefined }}>
                {remaining.mm}:{remaining.ss}
              </strong>
              {isExpiring && <span style={{ color: "red" }}> • Por expirar</span>}
              {isExpired && <span style={{ color: "red" }}> • Código expirado</span>}
            </div>

            {/* Formulario */}
            <form onSubmit={handleCambiar} noValidate>
              {/* Código 6 dígitos */}
              <label className="form-label text-white-90">Código</label>
              <div className="d-flex justify-content-between gap-2 mb-1" onPaste={handlePaste}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputsRef.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className={`form-control text-center pro-input ${errors.code ? "is-invalid" : ""}`}
                    maxLength={1}
                    value={code[i]}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    style={{ width: 48, fontWeight: 600, fontSize: 20 }}
                  />
                ))}
              </div>
              {errors.code && (
                <div className="invalid-feedback d-block mb-3">{errors.code}</div>
              )}

              {/* Contraseñas (mismo patrón de Input con ojo) */}
              <PasswordInput
                label="Nueva contraseña"
                value={pwd}
                onChange={(v) => {
                  setPwd(v);
                  if (errors.pwd) setErrors((e) => ({ ...e, pwd: "" }));
                }}
                shown={showPwd}
                onToggle={() => setShowPwd((v) => !v)}
                autoComplete="new-password"
                isInvalid={!!errors.pwd}
                invalidMsg={errors.pwd}
              />

              <PasswordInput
                label="Confirmar contraseña"
                value={pwd2}
                onChange={(v) => {
                  setPwd2(v);
                  if (errors.pwd2) setErrors((e) => ({ ...e, pwd2: "" }));
                }}
                shown={showPwd2}
                onToggle={() => setShowPwd2((v) => !v)}
                autoComplete="new-password"
                isInvalid={!!errors.pwd2}
                invalidMsg={errors.pwd2}
              />

              {/* Botones */}
              <div className="d-grid gap-2">
                <button
                  type="submit"
                  className="pro-btn"
                  disabled={isExpired || cambiando}
                  title={isExpired ? "Código expirado. Reenviar para continuar." : "Cambiar contraseña"}
                >
                  {cambiando ? "Cambiando..." : "Cambiar contraseña"}
                </button>

                <button
                  type="button"
                  className="btn btn-outline-secondary fw-semibold d-flex align-items-center justify-content-center gap-2"
                  onClick={handleReenviar}
                  disabled={!isExpired || reenviando}
                  title={!isExpired ? "Disponible cuando el código expire." : "Reenviar código"}
                >
                  <FiRefreshCw />
                  {reenviando ? "Reenviando..." : "Enviar nuevo código"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={3500} newestOnTop />
    </>
  );
}
