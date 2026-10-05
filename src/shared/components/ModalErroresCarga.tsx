"use client";

import { useEffect, useId, useRef } from "react";
import type { ErrorCargaArchivo, EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { BadgeEstadoCarga } from "@/shared/components/BadgeEstadoCarga";
import { ResumenErroresCarga } from "@/shared/components/ResumenErroresCarga";
import { SugerenciaErrorEstructura } from "@/shared/components/SugerenciaErrorEstructura";
import { IconoDescargar } from "@/shared/components/iconos";

type ModalErroresCargaProps = {
  abierto: boolean;
  carga: {
    id: string;
    nombreArchivoOriginal: string;
    estado: EstadoCargaArchivo;
    cantidadFilasDatos: number;
    cantidadErrores: number;
    errores: ErrorCargaArchivo[];
  };
  onCerrar: () => void;
};

// Detalle de los errores de una subida recién validada. `<dialog>` nativo, igual que
// `ModalHistorialRechazos`: mantiene el foco dentro y se cierra con Escape.
export function ModalErroresCarga({ abierto, carga, onCerrar }: ModalErroresCargaProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      className="m-auto w-[calc(100vw-2rem)] max-w-5xl overflow-hidden rounded-lg border border-gob-accent bg-white p-0 text-left text-gob-black shadow-2xl backdrop:bg-slate-950/55"
    >
      <header className="flex items-start justify-between gap-4 border-b border-gob-accent px-5 py-4">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-lg font-semibold text-gob-tertiary">
            Errores del archivo
          </h2>
          <p className="mt-0.5 break-all text-sm text-gob-gray-a">{carga.nombreArchivoOriginal}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar errores del archivo"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded text-2xl leading-none text-gob-gray-a hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          ×
        </button>
      </header>

      <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-gob-gray-a">
            <BadgeEstadoCarga estado={carga.estado} /> · {carga.cantidadFilasDatos} filas de datos,{" "}
            {carga.cantidadErrores} {carga.cantidadErrores === 1 ? "error" : "errores"}
          </p>
          <a
            href={`/api/notificador/cargas/${carga.id}/errores`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gob-primary underline-offset-2 hover:underline"
          >
            <IconoDescargar className="shrink-0" />
            Descargar errores (Excel)
          </a>
        </div>
        <SugerenciaErrorEstructura errores={carga.errores} />
        <ResumenErroresCarga errores={carga.errores} />
      </div>
    </dialog>
  );
}
