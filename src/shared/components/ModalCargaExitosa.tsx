"use client";

import { useEffect, useId, useRef } from "react";
import { Boton } from "@/shared/components/Boton";
import { IconoAprobado } from "@/shared/components/iconos";

type ModalCargaExitosaProps = {
  abierto: boolean;
  nombreArchivo: string;
  onCerrar: () => void;
};

export function ModalCargaExitosa({ abierto, nombreArchivo, onCerrar }: ModalCargaExitosaProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const idDescripcion = useId();

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
      aria-describedby={idDescripcion}
      onClose={onCerrar}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-gob-accent bg-white p-6 text-center text-gob-black shadow-xl backdrop:bg-gob-tertiary/50"
    >
      <div aria-hidden="true" className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 text-gob-success">
        <IconoAprobado className="size-8" />
      </div>
      <h2 id={idTitulo} className="text-xl font-semibold text-gob-success">Carga Exitosa</h2>
      <p id={idDescripcion} className="mt-3 break-words text-sm text-gob-gray-a">
        El archivo <strong>{nombreArchivo}</strong> se cargó y validó sin errores.
      </p>
      <div className="mt-6 flex justify-center">
        <Boton onClick={onCerrar}>Aceptar</Boton>
      </div>
    </dialog>
  );
}
