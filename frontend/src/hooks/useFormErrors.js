// frontend/src/hooks/useFormErrors.js
import { useState, useCallback, useMemo } from "react";

/**
 * Hook de manejo de errores de formulario.
 * API compatible con tu versión:
 *  - errors: objeto de errores { campo: "mensaje" }
 *  - setErrors(obj): reemplaza y/o hace merge de errores
 *  - hasError(name): boolean si el campo tiene error (soporta "a.b[0].c")
 *  - msg(name): mensaje del campo (string | undefined)
 *  - clearField(name): limpia el error de un campo
 *  - clearAll(): limpia todos los errores
 *  - setFieldError(name, message): setea un error para un campo
 *
 * Extras útiles:
 *  - mergeErrors(obj): mezcla errores al estado actual
 *  - fromAxios(err): normaliza errores de Axios/Express/Oracle a { field: msg }
 *  - firstErrorName / firstErrorMsg: para enfocar el primer error
 */

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return parts.reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

export default function useFormErrors(initial = {}) {
  const [errors, _setErrors] = useState(initial || {});

  // Reemplaza todo el objeto de errores (pero acepta null/undefined)
  const setErrors = useCallback((obj) => {
    _setErrors(() => (obj && typeof obj === "object" ? { ...obj } : {}));
  }, []);

  // Agrega/mezcla errores sin borrar los anteriores
  const mergeErrors = useCallback((obj) => {
    if (!obj || typeof obj !== "object") return;
    _setErrors((prev) => ({ ...(prev || {}), ...obj }));
  }, []);

  const hasError = useCallback((name) => {
    if (!name) return false;
    const direct = errors?.[name];
    if (direct) return true;
    // Soporte de paths "a.b[0].c"
    const viaPath = getByPath(errors, name);
    return Boolean(viaPath);
  }, [errors]);

  const msg = useCallback((name) => {
    if (!name) return undefined;
    const direct = errors?.[name];
    if (direct !== undefined) return direct;
    return getByPath(errors, name);
  }, [errors]);

  const clearField = useCallback((name) => {
    if (!name) return;
    _setErrors((prev) => {
      if (!prev) return {};
      if (!(name in prev)) {
        // Si el error vino por path (a.b[0].c) no lo podemos borrar con delete simple
        // En ese caso, reconstruimos superficialmente si aplica.
        return { ...prev };
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => _setErrors({}), []);

  const setFieldError = useCallback((name, message) => {
    if (!name) return;
    _setErrors((prev) => ({ ...(prev || {}), [name]: message }));
  }, []);

  // Normaliza respuestas típicas del backend (Axios/Express/Oracle)
  // y retorna { errores, general }
  const fromAxios = useCallback((err) => {
    const out = {};
    let general;

    // 1) Si viene un objeto de errores de validación ya plano
    const data = err?.response?.data ?? err?.data ?? err;
    if (data?.errors && typeof data.errors === "object") {
      // { errors: { campo: "mensaje", ... }, message?: string }
      Object.assign(out, data.errors);
      general = data.message || data.error || undefined;
    } else if (data?.message) {
      // 2) Mensaje general
      general = data.message;
    } else if (typeof data === "string") {
      general = data;
    } else if (err?.message) {
      general = err.message;
    }

    // 3) Mensajes Oracle/DB en "error" o "detail"
    if (!general && (data?.error || data?.detail)) {
      general = data.error || data.detail;
    }

    return { errores: out, general };
  }, []);

  const firstErrorName = useMemo(() => {
    const keys = Object.keys(errors || {});
    return keys.length ? keys[0] : undefined;
  }, [errors]);

  const firstErrorMsg = useMemo(() => {
    const k = firstErrorName;
    return k ? errors?.[k] : undefined;
  }, [errors, firstErrorName]);

  return {
    errors,
    setErrors,
    mergeErrors,
    hasError,
    msg,
    clearField,
    clearAll,
    setFieldError,
    fromAxios,
    firstErrorName,
    firstErrorMsg,
  };
}
