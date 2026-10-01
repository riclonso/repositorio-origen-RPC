"use client";

import { useEffect, useId, useRef } from "react";
import { Boton } from "@/shared/components/Boton";
import { IconoAprobado } from "@/shared/components/iconos";

type ModalCargaExitosaProps = {
  abierto: boolean;
  nombreArchivo: string;
  onCerrar: () => void;
  onFinalizar: () => void;
  procesando?: boolean;
  error?: string | null;
};

export function ModalCargaExitosa({ abierto, nombreArchivo, onCerrar, onFinalizar, procesando = false, error }: ModalCargaExitosaProps) {
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
      onCancel={(evento) => { if (procesando) evento.preventDefault(); }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-gob-accent bg-white p-6 text-center text-gob-black shadow-xl backdrop:bg-gob-tertiary/50"
    >
      <div aria-hidden="true" className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-green-100 text-gob-success">
        <IconoAprobado className="size-8" />
      </div>
      <h2 id={idTitulo} className="text-xl font-semibold text-gob-success">Carga Exitosa</h2>
      <p id={idDescripcion} className="mt-3 break-words text-sm text-gob-gray-a">
        El archivo <strong>{nombreArchivo}</strong> se cargó y validó sin errores.
      </p>
      <p className="mt-3 text-sm text-gob-gray-a">
        Al finalizar y enviar, el archivo quedará pendiente de aprobación. Esta acción no se puede deshacer.
      </p>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-gob-danger">{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Boton variante="secundario" onClick={onCerrar} disabled={procesando}>Cancelar</Boton>
        <Boton onClick={onFinalizar} cargando={procesando} textoCargando="Guardando...">
          <IconoAprobado className="shrink-0" />
          Finalizar y enviar
        </Boton>
      </div>
    </dialog>
  );
}
