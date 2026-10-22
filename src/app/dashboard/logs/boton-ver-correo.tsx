"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Boton } from "@/shared/components/Boton";
import { IconoCorreo } from "@/shared/components/iconos";

type BotonVerCorreoProps = {
  asunto: string;
  cuerpo: string;
  // Para el nombre accesible del botón: sin él, una página de fallas sería una lista de
  // "Ver correo, Ver correo, Ver correo" sin contexto.
  descripcionDestinatario: string;
};

// RF-44: muestra el correo que se intentó enviar, en TEXTO PLANO (sin `dangerouslySetInnerHTML`):
// asunto y cuerpo llegan del registro ya con todo enlace reemplazado por "[enlace]". `<dialog>`
// nativo con `showModal()`, mismo patrón que `DialogoConfirmacion`: trampa de foco, cierre con
// Escape y retorno del foco al botón que lo abrió.
export function BotonVerCorreo({ asunto, cuerpo, descripcionDestinatario }: BotonVerCorreoProps) {
  const [abierto, setAbierto] = useState(false);
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <>
      <Boton
        variante="texto"
        aria-label={`Ver correo dirigido a ${descripcionDestinatario}`}
        onClick={() => setAbierto(true)}
      >
        <IconoCorreo />
        Ver correo
      </Boton>

      <dialog
        ref={referenciaDialogo}
        aria-labelledby={idTitulo}
        onClose={() => setAbierto(false)}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gob-accent bg-white p-0 text-left text-gob-black shadow-2xl backdrop:bg-gob-tertiary/50"
      >
        <header className="border-b border-gob-accent px-5 py-4">
          <h2 id={idTitulo} className="text-lg font-semibold text-gob-tertiary">
            Correo que no se pudo enviar
          </h2>
          <p className="mt-0.5 text-sm text-gob-gray-a">Los enlaces se muestran como [enlace].</p>
        </header>

        <dl className="max-h-[65vh] overflow-auto px-5 py-4 text-sm">
          <dt className="font-semibold text-gob-tertiary">Asunto</dt>
          <dd className="mt-1 wrap-break-word text-gob-black">{asunto || "Sin asunto"}</dd>
          <dt className="mt-4 font-semibold text-gob-tertiary">Cuerpo</dt>
          <dd className="mt-1">
            <pre className="whitespace-pre-wrap wrap-break-word rounded-md bg-gob-neutral px-3 py-2 font-sans text-sm leading-6 text-gob-black">
              {cuerpo || "Sin cuerpo"}
            </pre>
          </dd>
        </dl>

        <footer className="flex justify-end border-t border-gob-accent px-5 py-3">
          <Boton variante="secundario" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </footer>
      </dialog>
    </>
  );
}
