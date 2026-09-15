"use client";

import { useEffect, useId, useRef } from "react";
import { Boton, type VarianteBoton } from "@/shared/components/Boton";

type DialogoConfirmacionProps = {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  textoConfirmando: string;
  variante?: VarianteBoton;
  procesando?: boolean;
  error?: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
};

// `<dialog>` nativo con showModal(): aporta trampa de foco y cierre con Escape sin dependencias.
export function DialogoConfirmacion({
  abierto,
  titulo,
  descripcion,
  textoConfirmar,
  textoConfirmando,
  variante = "primario",
  procesando = false,
  error,
  onConfirmar,
  onCancelar,
}: DialogoConfirmacionProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  // Cada instancia necesita su propio id: dos `DialogoConfirmacion` en la misma página (p. ej.
  // "Eliminar" y "Publicar" en `TablaVentanasCarga.tsx`) con un id fijo producían HTML inválido
  // (id duplicado) y el navegador resolvía `aria-labelledby` contra el primer elemento del DOM,
  // mostrando el título del otro diálogo.
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idDescripcion = `${idBase}-descripcion`;

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) {
      dialogo.showModal();
    } else if (!abierto && dialogo.open) {
      dialogo.close();
    }
  }, [abierto]);

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      aria-describedby={idDescripcion}
      onClose={onCancelar}
      onCancel={(evento) => {
        if (procesando) {
          evento.preventDefault();
        }
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-gob-accent bg-white p-6 text-gob-black shadow-lg backdrop:bg-gob-tertiary/50"
    >
      <h2 id={idTitulo} className="text-base font-semibold text-gob-black">
        {titulo}
      </h2>

      <p id={idDescripcion} className="mt-2 text-sm text-gob-gray-a">
        {descripcion}
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-gob-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-3">
        <Boton variante="secundario" onClick={onCancelar} disabled={procesando}>
          Cancelar
        </Boton>
        <Boton
          variante={variante}
          onClick={onConfirmar}
          cargando={procesando}
          textoCargando={textoConfirmando}
        >
          {textoConfirmar}
        </Boton>
      </div>
    </dialog>
  );
}
