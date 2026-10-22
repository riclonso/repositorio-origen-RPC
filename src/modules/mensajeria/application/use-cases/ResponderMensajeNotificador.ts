import type { MensajeHilo } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

export type ResultadoResponderMensajeNotificador =
  // `eraPrimerNoLeido` alimenta la regla anti-ráfaga del correo al equipo revisor: solo se avisa si,
  // antes de este mensaje, el equipo no tenía respuestas sin leer de ESTE notificador EN ESTA
  // VENTANA. Nunca sale en la respuesta HTTP. RF-44: `conteoFallido` discrimina si falló ese
  // conteo; si falló, el mensaje se guardó igual, no se avisa y `errorConteoAviso` lleva el error.
  | { ok: true; mensaje: MensajeHilo; eraPrimerNoLeido: boolean; conteoFallido: false }
  | { ok: true; mensaje: MensajeHilo; eraPrimerNoLeido: false; conteoFallido: true; errorConteoAviso: unknown }
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

  // Anti-ráfaga POR HILO (notificador, ventana), espejo de `EnviarMensajeRevisor`: "antes de este
  // mensaje" = respuestas del notificador sin leer por el equipo revisor (lectura compartida), de
  // esta misma ventana y creadas antes que él. De dos envíos concurrentes solo el primero avisa.
  // RF-44: el mensaje YA quedó guardado; un fallo del conteo solo significa "no avisar" (nunca un
  // 500, que invitaría a reenviar y duplicar el mensaje). El fallo vuelve en `errorConteoAviso`
  // para que el Route Handler lo registre.
  try {
    const noLeidosPrevios = await dependencias.repositorio.contarNoLeidosAnteriores({
      notificadorId: datos.notificadorId,
      ventanaCargaId: ultimoDelRevisor.ventanaCargaId,
      ladoAutor: "NOTIFICADOR",
      creadoAntesDe: mensaje.creadoEn,
    });

    return { ok: true, mensaje, eraPrimerNoLeido: noLeidosPrevios === 0, conteoFallido: false };
  } catch (errorConteoAviso) {
    return { ok: true, mensaje, eraPrimerNoLeido: false, conteoFallido: true, errorConteoAviso };
  }
}
