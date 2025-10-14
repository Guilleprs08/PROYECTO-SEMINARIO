// src/utils/confirmations.js
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

/**
 * 📌 Confirmación genérica para cualquier acción
 * Uso:
 *   confirmarAccion({
 *     title: "¿Deseas eliminar este registro?",
 *     text: "Esta acción no se puede deshacer",
 *     confirmButtonText: "Sí, eliminar",
 *     onConfirm: async () => { ... },
 *   });
 */
export const confirmarAccion = async ({
  title = "¿Estás seguro?",
  text = "No podrás revertir esta acción",
  confirmButtonText = "Sí, continuar",
  cancelButtonText = "Cancelar",
  onConfirm,
  onCancel,
}) => {
  const result = await MySwal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });

  if (result.isConfirmed && typeof onConfirm === "function") {
    try {
      await onConfirm();
    } catch (error) {
      console.error("❌ Error en la operación:", error);
      const backendMsg =
        error?.response?.data?.message ||
        error?.message ||
        "Ocurrió un problema en la operación.";

      await MySwal.fire({
        title: "Error",
        text: backendMsg,
        icon: "error",
        confirmButtonColor: "#3085d6",
        confirmButtonText: "Entendido",
      });
    }
  } else if (result.isDismissed && typeof onCancel === "function") {
    onCancel();
  }
};

/**
 * 🗑 Confirmación específica para eliminar (compatibilidad con tu versión anterior)
 * Uso:
 *   confirmarEliminar(() => eliminarUsuario(id), () => console.log("Cancelado"));
 */
export const confirmarEliminar = (onConfirm, onCancel) => {
  confirmarAccion({
    title: "Confirmar eliminación",
    text: "¿Está seguro de eliminar este usuario?",
    confirmButtonText: "Sí, eliminar",
    onConfirm,
    onCancel,
  });
};
