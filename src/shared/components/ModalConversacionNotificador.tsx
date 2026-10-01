"use client";

import { useEffect, useId, useRef, useState } from "react";
import { enviarJson, pedirJson } from "@/shared/components/clienteMensajeria";
import { HiloMensajes } from "@/shared/components/HiloMensajes";
import {
  fusionarMensajes,
  hastaParaMarcarLeidos,
  type HiloNotificadorVista,
  type MensajeVista,
} from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { useRefrescoPeriodico } from "@/shared/hooks/useRefrescoPeriodico";

type ModalConversacionNotificadorProps = {
  ventanaCargaId: string;
  tituloVentana: string;
  onCerrar: () => void;
  // Recibe cada marca de lectura en vuelo, para que quien abrió el modal refresque los avisos
  // recién cuando la lectura llegó a la base (ver `useRefrescoTrasLecturas`).
  onLecturaIniciada?: (lectura: Promise<unknown>) => void;
};

// RF-31: conversación del notificador con el equipo revisor en UNA ventana. Una sola columna: hay
// un único interlocutor (la bandeja compartida del equipo revisor); cada mensaje del revisor
// muestra el nombre de quien lo escribió. Se monta solo mientras está abierto.
export function ModalConversacionNotificador({
  ventanaCargaId,
  tituloVentana,
  onCerrar,
  onLecturaIniciada,
}: ModalConversacionNotificadorProps) {
  const referenciaDialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const rutaMensajes = `/api/notificador/ventanas-carga/${ventanaCargaId}/mensajes`;

  const [hilo, setHilo] = useState<HiloNotificadorVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    referenciaDialogo.current?.showModal();
  }, []);

  // Al abrir y cada 20 s con la pestaña visible. Tras cada carga con mensajes del revisor sin leer,
  // se marcan como leídos hasta el último mensaje mostrado.
  useRefrescoPeriodico(async (senal) => {
    const respuesta = await pedirJson<HiloNotificadorVista>(rutaMensajes, senal);
    if (!respuesta) return;

    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }

    setError(null);
    // Fusión por id: si esta consulta se pidió antes de una respuesta propia, no la trae y no debe
    // borrarla de la vista.
    const recibido = respuesta.datos;
    setHilo((actual) => ({ ...recibido, mensajes: fusionarMensajes(recibido.mensajes, actual?.mensajes ?? []) }));

    const hasta = hastaParaMarcarLeidos(respuesta.datos.mensajes, "NOTIFICADOR");
    if (!hasta) return;

    const lectura = enviarJson<{ actualizados: number }>(`${rutaMensajes}/lectura`, { hasta });
    onLecturaIniciada?.(lectura);
    await lectura;
  }, ventanaCargaId);

  async function responder(contenido: string): Promise<string | null> {
    const respuesta = await enviarJson<{ mensaje: MensajeVista }>(rutaMensajes, { contenido });
    if (!respuesta.ok) return respuesta.error;

    const nuevo = respuesta.datos.mensaje;
    setHilo((actual) => (actual ? { ...actual, mensajes: fusionarMensajes([nuevo], actual.mensajes) } : actual));
    return null;
  }

  return (
    <dialog
      ref={referenciaDialogo}
      aria-labelledby={idTitulo}
      onClose={onCerrar}
      className="m-auto w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-lg border border-gob-accent bg-white p-0 text-left text-gob-black shadow-2xl backdrop:bg-slate-950/55"
    >
      <div className="flex h-[80vh] flex-col md:h-[70vh]">
        <header className="flex items-start justify-between gap-4 border-b border-gob-accent px-5 py-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-semibold text-gob-tertiary">
              Mensajes del equipo revisor
            </h2>
            <p className="mt-0.5 truncate text-sm text-gob-gray-a">{tituloVentana}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar mensajes del equipo revisor"
            className="inline-flex size-8 items-center justify-center rounded text-2xl leading-none text-gob-gray-a hover:bg-gob-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
          >
            ×
          </button>
        </header>

        <HiloMensajes
          mensajes={hilo?.mensajes ?? []}
          ladoPropio="NOTIFICADOR"
          hayMasAntiguos={hilo?.hayMasAntiguos ?? false}
          cargando={hilo === null}
          error={error}
          textoVacio="Todavía no tienes mensajes del equipo revisor en esta ventana."
          puedeEscribir={hilo?.puedeResponder ?? false}
          textoSinPermisoEscritura="Podrás responder cuando el equipo revisor te escriba sobre una carga de esta ventana."
          archivoAsociado={null}
          etiquetaRedaccion="Respuesta para el equipo revisor"
          onEnviar={responder}
        />
      </div>
    </dialog>
  );
}
