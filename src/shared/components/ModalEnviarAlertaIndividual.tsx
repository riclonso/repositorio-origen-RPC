"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Boton } from "@/shared/components/Boton";
import { EditorTextoEnriquecidoLimitado } from "@/shared/components/EditorTextoEnriquecidoLimitado";

// Definido aquí (y reexportado) en vez de en `TablaNotificadoresPendientesVentana.tsx`, que es
// quien lo consume: evita el ciclo de módulos que resultaría de que ambos archivos se importen
// entre sí.
export type PendienteAlertaVista = {
  id: string;
  nombreCompleto: string;
  email: string;
  // HTML ya resuelto (placeholders + enlace reales) y sanitizado, precarga de este modal.
  mensajePrevio: string;
};

type ModalEnviarAlertaIndividualProps = {
  destinatario: PendienteAlertaVista | null;
  procesando: boolean;
  error: string | null;
  onConfirmar: (mensajeHtml: string) => void;
  onCancelar: () => void;
};

type ContenidoModalAlertaIndividualProps = {
  destinatario: PendienteAlertaVista;
  idTitulo: string;
  procesando: boolean;
  error: string | null;
  onConfirmar: (mensajeHtml: string) => void;
  onCancelar: () => void;
};

// Contenido del modal, remontado por `key={destinatario.id}` en el componente padre cada vez que
// cambia el destinatario: así el estado del mensaje editado nace correcto con un inicializador
// perezoso (`useState(() => ...)`), sin `useEffect` ni lectura de refs durante el render para
// "reiniciarlo" a mano.
function ContenidoModalAlertaIndividual({
  destinatario,
  idTitulo,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}: ContenidoModalAlertaIndividualProps) {
  const [mensajeHtml, setMensajeHtml] = useState(() => destinatario.mensajePrevio);

  return (
    <>
      <h2 id={idTitulo} className="text-base font-semibold text-gob-black">
        Enviar aviso a {destinatario.nombreCompleto}
      </h2>

      <div className="mt-3">
        <EditorTextoEnriquecidoLimitado
          idNamespace={`alerta-individual-${destinatario.id}`}
          valorInicialHtml={destinatario.mensajePrevio}
          onChangeHtml={setMensajeHtml}
          disabled={procesando}
        />
      </div>

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
          variante="primario"
          onClick={() => onConfirmar(mensajeHtml)}
          cargando={procesando}
          textoCargando="Enviando..."
        >
          Enviar
        </Boton>
      </div>
    </>
  );
}

// Modal de envío individual (RF-17): mismo editor que la plantilla de la ventana, precargado con
// el mensaje ya resuelto server-side para ESE destinatario concreto (`mensajePrevio`, con
// placeholders y enlace ya resueltos). El operador puede seguir editándolo antes de confirmar; el
// servidor vuelve a sanitizar y revalida que el destinatario siga pendiente antes de enviar.
export function ModalEnviarAlertaIndividual({
  destinatario,
  procesando,
  error,
  onConfirmar,
  onCancelar,
}: ModalEnviarAlertaIndividualProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;

  useEffect(() => {
    const dialogo = referenciaDialogo.current;
    if (!dialogo) return;

    if (destinatario && !dialogo.open) {
      dialogo.showModal();
    } else if (!destinatario && dialogo.open) {
      dialogo.close();
    }
  }, [destinatario]);

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCancelar}
      onCancel={(evento) => {
        if (procesando) evento.preventDefault();
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-gob-accent bg-white p-6 text-gob-black shadow-lg backdrop:bg-gob-tertiary/50"
    >
      {destinatario ? (
        <ContenidoModalAlertaIndividual
          key={destinatario.id}
          destinatario={destinatario}
          idTitulo={idTitulo}
          procesando={procesando}
          error={error}
          onConfirmar={onConfirmar}
          onCancelar={onCancelar}
        />
      ) : (
        <h2 id={idTitulo} className="text-base font-semibold text-gob-black">
          Enviar aviso
        </h2>
      )}
    </dialog>
  );
}
