// src/components/combos/UploadDropzone.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Props:
 *  - value: File|null|string (URL existente también soportada)
 *  - onChange?: (file: File|null) => void
 *  - accept?: string (por defecto "image/*")
 *  - disabled?: boolean
 *  - placeholder?: string
 */
export default function UploadDropzone({
  value,
  onChange,
  accept = "image/*",
  disabled = false,
  placeholder = "⬆ Subir imagen o arrastrar aquí",
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [objectUrl, setObjectUrl] = useState(null);

  // Crear/revocar URL de preview si value es File
  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setObjectUrl(null);
  }, [value]);

  const hasImage = useMemo(() => {
    if (!value) return false;
    if (value instanceof File) return value.type?.startsWith("image/");
    if (typeof value === "string") return true; // asumimos URL válida
    return false;
  }, [value]);

  const previewSrc = value instanceof File ? objectUrl : typeof value === "string" ? value : null;

  const fileSize = useMemo(() => {
    if (!(value instanceof File)) return "";
    const mb = value.size / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }, [value]);

  const handlePick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (disabled) return;
    onChange?.(file);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (disabled) return;
    // Limpia input para permitir volver a seleccionar el mismo archivo
    if (inputRef.current) inputRef.current.value = "";
    onChange?.(null);
  };

  // Drag & Drop
  const onDragOver = (e) => {
    if (disabled) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = (e) => {
    if (disabled) return;
    e.preventDefault();
    setDragOver(false);
  };
  const onDrop = (e) => {
    if (disabled) return;
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0] || null;
    if (file) onChange?.(file);
  };

  // Accesibilidad teclado
  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePick();
    }
  };

  return (
    <div
      className={`upload-dropzone border rounded-3 p-3 ${dragOver ? "bg-light" : ""} ${disabled ? "opacity-75" : "cursor-pointer"}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={handlePick}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-disabled={disabled}
      aria-label="Subir imagen"
      style={{ userSelect: "none" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* Contenido */}
      <div className="d-flex align-items-center gap-3">
        {/* Preview */}
        {hasImage && previewSrc ? (
          <img
            src={previewSrc}
            alt="Vista previa"
            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" }}
          />
        ) : (
          <div
            className="d-flex align-items-center justify-content-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              border: "1px dashed #bbb",
              fontSize: 22,
              color: "#888",
              background: "#fafafa",
            }}
            aria-hidden="true"
          >
            ⬆
          </div>
        )}

        {/* Texto y acciones */}
        <div className="flex-grow-1">
          <div className="dz-placeholder text-muted">
            {value instanceof File ? (
              <>
                <strong className="text-body">{value.name}</strong>
                <small className="ms-2">{fileSize}</small>
              </>
            ) : typeof value === "string" && value ? (
              <strong className="text-body">Imagen seleccionada</strong>
            ) : (
              placeholder
            )}
          </div>

          <div className="mt-2 d-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-primary" disabled={disabled}>
              Elegir archivo
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleClear}
                disabled={disabled}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
