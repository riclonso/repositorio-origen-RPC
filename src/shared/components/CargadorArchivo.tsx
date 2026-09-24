"use client";

import { useRef, useState } from "react";
import { IconoSubir } from "@/shared/components/iconos";

type CargadorArchivoProps = {
  id: string;
  disabled?: boolean;
  onArchivo: (archivo: File | null) => void;
};

export function CargadorArchivo({ id, disabled = false, onArchivo }: CargadorArchivoProps) {
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

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-gob-black">
        Archivo (.xlsx o .csv, máximo 10 MB)
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
          accept=".xlsx,.csv"
          disabled={disabled}
          onChange={handleInputChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />

        {/* Icono y texto */}
        <div className="pointer-events-none flex flex-col items-center gap-2 text-center">
          <IconoSubir className="text-gob-primary" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gob-black">
              {dragOver ? "Suelta el archivo aquí" : "Arrastra un archivo aquí"}
            </p>
            <p className="text-xs text-gob-gray-a">o haz clic para seleccionar</p>
          </div>
        </div>
      </div>
    </div>
  );
}
