// src/utils/validations.js

// ───────────────────────────────────────────────────────────────
// Validaciones de campos de texto específicos (compatibles con tu código)
// ───────────────────────────────────────────────────────────────

export function validarNombre(nombre) {
  if (!nombre) return 'El nombre es obligatorio';
  if (/^\d+$/.test(nombre)) {
    return 'El nombre no puede ser solo números';
  }
  if (/\s{2,}/.test(nombre)) {
    return 'El nombre no puede contener múltiples espacios seguidos';
  }
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(nombre)) {
    return 'El nombre solo puede contener letras y espacios';
  }
  return null; // null = sin error
}

export function validarUsuario(usuario) {
  if (!usuario) return 'El usuario es obligatorio';
  if (!/^[A-Za-z0-9]{1,9}$/.test(usuario)) {
    return 'El usuario debe tener máximo 9 caracteres alfanuméricos, sin espacios ni caracteres especiales';
  }
  return null;
}

export function validarContrasena(contrasena) {
  if (!contrasena) return 'La contraseña es obligatoria';
  if (contrasena.length > 20) {
    return 'La contraseña no puede exceder 20 caracteres';
  }
  return null;
}

// ───────────────────────────────────────────────────────────────
// Utilidades genéricas para formularios (usadas por IBER)
// ───────────────────────────────────────────────────────────────

/**
 * Valida que los campos requeridos no estén vacíos.
 * @param {object} formData - Objeto con datos del formulario.
 * @param {string[]} camposObligatorios - Lista de nombres de campos requeridos.
 * @returns {object} { campo: "mensaje" } sólo con los campos con error.
 */
export function validarCamposObligatorios(formData, camposObligatorios = []) {
  const errores = {};
  for (const campo of camposObligatorios) {
    const v = formData?.[campo];
    if (v == null || String(v).trim() === '') {
      errores[campo] = 'Este campo es obligatorio';
    }
  }
  return errores;
}

/**
 * Verifica que un valor sea un número > 0 (acepta coma decimal).
 * @param {*} valor - Valor a validar.
 * @param {string} campo - Nombre del campo para el mensaje.
 * @returns {object} { [campo]: "mensaje" } o {} si es válido.
 */
export function validarNumeroPositivo(valor, campo = 'valor') {
  const n = Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    return { [campo]: 'Debe ser un número mayor a 0' };
  }
  return {};
}

/**
 * Une múltiples objetos de errores en uno solo.
 * @param  {...object} arr - Objetos de errores a unir.
 * @returns {object} Objeto de errores combinado.
 */
export function mergeErrores(...arr) {
  return arr.reduce((acc, cur) => Object.assign(acc, cur || {}), {});
}
