import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import {
  TOPE_MENSAJES_HILO,
  type HiloVentana,
  type InterlocutorNotificador,
} from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

export type ArchivoReferenciado = {
  id: string;
  nombreArchivoOriginal: string;
};

export type HiloVentanaRevisor = HiloVentana & {
  notificador: InterlocutorNotificador;
  // Carga `PENDIENTE_VISTO_BUENO` ya finalizada de este par (notificador, ventana), si existe.
  // Como una ventana tiene un solo formato, hay como máximo una.
  cargaPendiente: ArchivoReferenciado | null;
  // Carga a la que se asociaría el próximo mensaje del revisor: la pendiente si existe; si no, la
  // del último mensaje del hilo. Misma regla que `enviarMensajeRevisorEnConversacion`.
  cargaDestino: ArchivoReferenciado | null;
};

export type ResultadoObtenerHiloRevisor =
  | { ok: true; hilo: HiloVentanaRevisor }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// Hilo de un notificador en una ventana, visto por el equipo revisor. Sin efectos secundarios: la
// marca de lectura es una petición aparte, con su propio corte `hasta`. Un par (notificador,
// ventana) sin mensajes Y sin carga pendiente no tiene nada que mostrar ni desde dónde iniciar una
// conversación: se trata como inexistente (404), para no exponer datos de cualquier cuenta por id.
export async function obtenerHiloVentanaRevisor(
  datos: { ventanaCargaId: string; notificadorId: string },
  dependencias: { repositorio: MensajeCargaRepository; repositorioCargas: CargaArchivoRepository },
): Promise<ResultadoObtenerHiloRevisor> {
  const [notificador, hilo, cargaPendiente] = await Promise.all([
    dependencias.repositorio.obtenerInterlocutorNotificador(datos.notificadorId),
    dependencias.repositorio.listarHilo(datos.notificadorId, datos.ventanaCargaId, TOPE_MENSAJES_HILO),
    dependencias.repositorioCargas.obtenerPendienteFinalizadaPorUsuarioYVentana(
      datos.notificadorId,
      datos.ventanaCargaId,
    ),
  ]);

  if (!notificador || (hilo.mensajes.length === 0 && !cargaPendiente)) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const pendiente: ArchivoReferenciado | null = cargaPendiente
    ? { id: cargaPendiente.id, nombreArchivoOriginal: cargaPendiente.nombreArchivoOriginal }
    : null;

  const ultimoMensaje = hilo.mensajes.at(-1);
  const delUltimoMensaje: ArchivoReferenciado | null = ultimoMensaje
    ? { id: ultimoMensaje.cargaArchivoId, nombreArchivoOriginal: ultimoMensaje.nombreArchivoOriginal }
    : null;

  return {
    ok: true,
    hilo: {
      ...hilo,
      notificador,
      cargaPendiente: pendiente,
      cargaDestino: pendiente ?? delUltimoMensaje,
    },
  };
}

export type HiloVentanaNotificador = HiloVentana & {
  // El notificador solo puede responder si el equipo revisor ya le escribió en esta ventana.
  puedeResponder: boolean;
};

// Hilo propio del notificador en una ventana. La propiedad se fija con `notificadorId` (que sale
// siempre de la sesión) en el WHERE: pedir una ventana ajena devuelve una lista vacía.
export async function obtenerHiloVentanaNotificador(
  datos: { ventanaCargaId: string; notificadorId: string },
  dependencias: { repositorio: MensajeCargaRepository },
): Promise<HiloVentanaNotificador> {
  const [hilo, ultimoDelRevisor] = await Promise.all([
    dependencias.repositorio.listarHilo(datos.notificadorId, datos.ventanaCargaId, TOPE_MENSAJES_HILO),
    dependencias.repositorio.obtenerUltimoMensaje(datos.notificadorId, datos.ventanaCargaId, "REVISOR"),
  ]);

  return { ...hilo, puedeResponder: ultimoDelRevisor !== null };
}
