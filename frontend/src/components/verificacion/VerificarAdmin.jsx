// src/components/modals/VerificarAdmin.jsx
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import "../../styles/modals/verificar-admin.css";

// ===== API base unificado (tus fallbacks) =====
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

// ===== Auth headers con mf_token =====
const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const post = (path, data = {}, cfg = {}) =>
  axios.post(`${API_BASE}${path}`, data, {
    ...cfg,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(cfg.headers || {}) },
  });

/**
 * Modal de verificación de administrador
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onSuccess: (adminInfo) => void  // { id, usuario, rol, role_id, ... }
 */
export default function VerificarAdmin({ open, onClose, onSuccess }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const userRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setUsuario("");
    setPassword("");
    setTimeout(() => userRef.current?.focus(), 50);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && !loading) onClose?.();
      if (e.key === "Enter" && !loading) handleSubmit(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    if (!modalRef.current) return;
    // Cerrar solo si se hace click FUERA de la tarjeta
    if (modalRef.current.contains(e.target)) return;
    if (!loading) onClose?.();
  };

  const callVerifyAdmin = async (u, p) => {
    // Probar endpoints típicos según tu server (compatibilidad)
    const candidates = [
      "/api/auth/verify-admin",
      "/api/empleados/verify-admin",
      "/api/admin/verify",
    ];
    const payload = {
      username: u,
      usuario: u, // por compatibilidad con controladores que esperan 'usuario'
      password: p,
    };

    for (const path of candidates) {
      try {
        const { data } = await post(path, payload);
        if (data) return { data, pathTried: path };
      } catch (_) {
        // probar siguiente
      }
    }
    throw new Error("Endpoint de verificación de administrador no disponible.");
  };

  const normalizeAdmin = (raw) => {
    if (!raw) return null;
    const a = raw.admin || raw.user || raw.usuario || raw;
    return {
      id: a?.id || a?.ID || a?.id_usuario || a?.ID_USUARIO || null,
      usuario: a?.usuario || a?.USERNAME || a?.name || a?.NAME || "",
      rol: a?.rol || a?.role || a?.ROL || a?.ROLE || "",
      role_id: a?.role_id || a?.ROL_ID || a?.id_rol || null,
      ...a,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = usuario.trim();
    const p = password.trim();

    if (!u || !p) {
      toast.error("Ingrese usuario y contraseña de administrador.");
      return;
    }

    try {
      setLoading(true);

      const resp = await callVerifyAdmin(u, p);
      const data = resp?.data;

      // Acepta varias formas de éxito
      const ok =
        data?.ok === true ||
        data?.success === true ||
        !!data?.admin ||
        !!data?.user ||
        !!data?.usuario;

      if (!ok) {
        toast.error(data?.message || "Credenciales inválidas.");
        return;
      }

      const adminInfo = normalizeAdmin(data);
      if (!adminInfo?.id) {
        toast.warn("Administrador verificado, pero no se obtuvo ID de usuario.");
      }

      toast.success("Administrador verificado.");
      onSuccess?.(adminInfo);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "No se pudo verificar admin.";
      toast.error(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="va-backdrop"
      onMouseDown={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby="va-title"
      aria-describedby="va-desc"
    >
      <div className="va-card" ref={modalRef}>
        <h3 id="va-title" className="va-title">Confirmación de administrador</h3>
        <p id="va-desc" className="va-subtitle">
          Ingrese credenciales de administrador para autorizar el cierre o apertura de caja.
        </p>

        <form className="va-form" onSubmit={handleSubmit} autoComplete="off">
          <div className="va-field">
            <label className="va-label">Usuario</label>
            <input
              ref={userRef}
              type="text"
              className="va-input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              disabled={loading}
              inputMode="text"
            />
          </div>

          <div className="va-field">
            <label className="va-label">Contraseña</label>
            <input
              type="password"
              className="va-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="va-actions">
            <button
              type="button"
              className="va-btn va-btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button type="submit" className="va-btn va-btn-primary" disabled={loading}>
              {loading ? "Verificando..." : "Autorizar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
