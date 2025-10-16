// src/pages/RecuperacionDeContrasena.jsx
import React, { useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useNavigate } from "react-router-dom";
import { FiMail, FiUser } from "react-icons/fi";
import "../../styles/actualizar-contrasena.css"; // ✅ reutilizamos el mismo CSS (ruta desde /pages)

const BG_URL = "/img/bg-cinema.jpg";

export default function RecuperacionDeContrasena() {
  const [identificador, setIdentificador] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errors, setErrors] = useState({ identificador: "" });
  const navigate = useNavigate();

  const limpiarErrores = () => setErrors({ identificador: "" });

  const validarFrontend = (id) => {
    if (!id) {
      setErrors({ identificador: "Este campo es obligatorio." });
      return false;
    }
    if (id.includes("@")) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!re.test(id)) {
        setErrors({ identificador: "Formato de correo no válido." });
        return false;
      }
    }
    setErrors({ identificador: "" });
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = identificador.trim().toLowerCase();
    if (!validarFrontend(id)) return;

    setEnviando(true);
    try {
      // 👇 Llamada directa al flujo de recuperación (respuesta genérica)
      const resp = await axios.post("http://localhost:3001/password/forgot", {
        identificador: id,
      });

      const ttl = Number(resp?.data?.ttl ?? 60);
      const expiresAt = Date.now() + ttl * 1000;

      toast.success("Si tu cuenta es válida, recibirás un código.");
      navigate("/validacion-codigo", {
        replace: true,
        state: { identificador: id, expiresAt },
      });
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "Ocurrió un error al iniciar la recuperación. Inténtalo nuevamente.";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {/* Fondo y layout iguales al de ActualizarContrasena */}
      <div
        className="pro-bg-fixed"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.4), rgba(0,0,0,.55)), url('${BG_URL}')`,
        }}
      />
      <div className="pro-screen">
        <div className="pro-login-card">
          <div className="pro-form">
            <div className="pro-title" style={{ marginBottom: 4 }}>
              <h2 className="m-0">Recuperar contraseña</h2>
            </div>
            <p className="pro-sub">
              Ingresa tu <strong>usuario o correo</strong> para enviarte un código de verificación.
            </p>

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label className="form-label text-white-90">Usuario o correo</label>
                <div className="input-group">
                  <span className="input-group-text pro-eye-btn" style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
                    {identificador.includes("@") ? <FiMail /> : <FiUser />}
                  </span>
                  <input
                    type="text"
                    className={`form-control pro-input ${errors.identificador ? "is-invalid" : ""}`}
                    placeholder="ejemplo@correo.com o tu_usuario"
                    value={identificador}
                    onChange={(e) => {
                      setIdentificador(e.target.value);
                      if (errors.identificador) limpiarErrores();
                    }}
                    onBlur={() => {
                      const id = identificador.trim().toLowerCase();
                      if (!id) setErrors({ identificador: "Este campo es obligatorio." });
                    }}
                    autoFocus
                  />
                  {errors.identificador && (
                    <div className="invalid-feedback">{errors.identificador}</div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="pro-btn"
                disabled={enviando || !identificador.trim()}
                title={!identificador.trim() ? "Completa el identificador" : ""}
              >
                {enviando ? "Enviando..." : "Enviar código"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <ToastContainer position="top-right" autoClose={3500} newestOnTop />
    </>
  );
}
