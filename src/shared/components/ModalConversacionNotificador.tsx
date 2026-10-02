"use client";

import { useEffect, useId, useRef, useState } from "react";
import { enviarJson, pedirJson } from "@/shared/components/clienteMensajeria";
import { HiloMensajes } from "@/shared/components/HiloMensajes";
import { EncabezadoChat } from "@/shared/components/EncabezadoChat";
import {
  fusionarMensajes,
  hastaParaMarcarLeidos,
  type HiloNotificadorVista,
  type MensajeVista,
} from "@/modules/mensajeria/schemas/vistas-mensajeria";
import { useRefrescoPeriodico } from "@/shared/hooks/useRefrescoPeriodico";
import estilos from "./Chat.module.css";

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
      className={estilos.modal}
    >
      <div className={estilos.contenidoModal}>
        <EncabezadoChat idTitulo={idTitulo} titulo="Mensajes del equipo revisor" subtitulo={tituloVentana}
          etiquetaCerrar="Cerrar mensajes del equipo revisor" onCerrar={onCerrar} />

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
