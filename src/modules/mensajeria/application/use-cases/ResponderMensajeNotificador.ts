import type { MensajeHilo } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

export type ResultadoResponderMensajeNotificador =
  | { ok: true; mensaje: MensajeHilo }
  | { ok: false; motivo: "SIN_CONVERSACION" };

// El notificador nunca inicia: solo responde en una ventana donde exista al menos un mensaje del
// equipo revisor en SU hilo (`notificadorId` sale siempre de la sesión). La respuesta se asocia a
// la carga del último mensaje del revisor en ese par (notificador, ventana), resuelta aquí y nunca
// enviada por el cliente. Puede responder mientras exista la conversación, sin importar el estado
// de la carga ni si la ventana sigue abierta.
export async function responderMensajeNotificador(
  datos: { notificadorId: string; ventanaCargaId: string; contenido: string },
  dependencias: { repositorio: MensajeCargaRepository },
): Promise<ResultadoResponderMensajeNotificador> {
  const ultimoDelRevisor = await dependencias.repositorio.obtenerUltimoMensaje(
    datos.notificadorId,
    datos.ventanaCargaId,
    "REVISOR",
  );

  if (!ultimoDelRevisor) {
    return { ok: false, motivo: "SIN_CONVERSACION" };
  }

  const mensaje = await dependencias.repositorio.crear({
    cargaArchivoId: ultimoDelRevisor.cargaArchivoId,
    ventanaCargaId: ultimoDelRevisor.ventanaCargaId,
    notificadorId: datos.notificadorId,
    autorId: datos.notificadorId,
    ladoAutor: "NOTIFICADOR",
    contenido: datos.contenido,
    creadoEn: new Date(),
  });

  return { ok: true, mensaje };
}
