export const validarCamposObligatorios = (formData, camposObligatorios) => {
  const errores = {};

  camposObligatorios.forEach((campo) => {
    if (!formData[campo] || formData[campo].toString().trim() === '') {
      errores[campo] = 'Este campo es obligatorio';
    }
  });

  return errores; // Devuelve un objeto { campo: 'mensaje error' }
};
