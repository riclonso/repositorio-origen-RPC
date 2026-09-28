"use client";

import { useRef, useState } from "react";
import { IconoDocumento, IconoSubir } from "@/shared/components/iconos";

type CargadorArchivoProps = {
  id: string;
  disabled?: boolean;
  // Extensión aceptada (p. ej. ".csv") y descripción visible del tipo esperado (p. ej. "CSV (.csv)
  // separado por punto y coma (;)"). El `accept` es solo una ayuda del navegador: el servidor
  // vuelve a exigir el tipo del formato.
  extension?: string;
  descripcionTipo?: string;
  archivo?: File | null;
  onArchivo: (archivo: File | null) => void;
};

function formatearTamano(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CargadorArchivo({
  id,
  disabled = false,
  extension = ".xlsx,.csv",
  descripcionTipo = ".xlsx o .csv",
  archivo = null,
  onArchivo,
}: CargadorArchivoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const archivo = e.dataTransfer.files?.[0];
    if (archivo) {
      onArchivo(archivo);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onArchivo(e.target.files?.[0] ?? null);
  };

  function quitarArchivo() {
    if (inputRef.current) inputRef.current.value = "";
    onArchivo(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gob-black">
        Archivo ({descripcionTipo}, máximo 10 MB)
      </label>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-all ${
          disabled
            ? "cursor-not-allowed border-gob-neutral bg-gob-neutral/30"
            : dragOver
              ? "border-gob-primary bg-gob-primary/5"
              : "border-gob-accent bg-white hover:border-gob-primary/50 hover:bg-gob-primary/2.5 cursor-pointer"
        }`}
      >
        {/* Input invisible */}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={extension}
          disabled={disabled}
          onChange={handleInputChange}
          className={`absolute inset-0 cursor-pointer opacity-0 ${archivo ? "pointer-events-none" : ""}`}
        />

        {archivo ? (
          <div className="pointer-events-none flex w-full items-center gap-3 rounded-md bg-gob-primary/5 px-3 py-2 text-left">
            <IconoDocumento className="shrink-0 text-gob-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gob-black">{archivo.name}</p>
              <p className="mt-0.5 text-xs text-gob-gray-a">Archivo adjunto · {formatearTamano(archivo.size)}</p>
            </div>
            <button type="button" onClick={quitarArchivo} disabled={disabled} className="pointer-events-auto shrink-0 text-xs font-semibold text-gob-primary underline hover:text-gob-primary-oscuro">
              Quitar
            </button>
          </div>
        ) : (
          <div className="pointer-events-none flex flex-col items-center gap-2 text-center">
            <IconoSubir className="text-gob-primary" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-gob-black">{dragOver ? "Suelta el archivo aquí" : "Arrastra un archivo aquí"}</p>
              <p className="text-xs text-gob-gray-a">o haz clic para seleccionar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
