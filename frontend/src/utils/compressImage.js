// src/utils/compressImage.js
import imageCompression from "browser-image-compression";

/**
 * 📌 Comprimir imagen antes de subir a Firebase
 * @param {File} file - archivo original
 * @returns {Promise<File>} archivo comprimido listo para subir
 */
export const compressImage = async (file) => {
  if (!file) {
    console.warn("⚠️ No se recibió archivo para comprimir");
    return null;
  }

  const options = {
    maxSizeMB: 1,            // 👉 tamaño máximo ~1MB
    maxWidthOrHeight: 1200,  // 👉 redimensiona a 1200px máximo
    useWebWorker: true,      // 👉 mejora rendimiento
  };

  try {
    console.log(`📂 Tamaño original: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    const compressedFile = await imageCompression(file, options);
    console.log(`✅ Tamaño comprimido: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
    console.log("📦 Archivo comprimido listo para subir:", compressedFile.name || "blob");
    return compressedFile;
  } catch (error) {
    console.error("❌ Error al comprimir imagen, se usará archivo original:", error);
    return file; // fallback: si falla devuelve el archivo original
  }
};
