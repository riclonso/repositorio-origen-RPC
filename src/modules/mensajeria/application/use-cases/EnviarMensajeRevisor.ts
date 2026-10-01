import type { CargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { MensajeHilo } from "@/modules/mensajeria/domain/entities/MensajeCarga";
import type { MensajeCargaRepository } from "@/modules/mensajeria/domain/repositories/MensajeCargaRepository";

type DependenciasEnvioRevisor = {
  repositorio: MensajeCargaRepository;
  repositorioCargas: CargaArchivoRepository;
};

export type ResultadoEnviarMensajeRevisor =
  // `carga` es la carga con la que quedó etiquetado el mensaje: el Route Handler la usa para
  // auditar (dueño y RUT) y para el correo (formato y año), sin volver a consultarla.
  // `eraPrimerNoLeido` alimenta la regla anti-ráfaga del correo: solo se avisa si, antes de este
  // mensaje, el notificador no tenía ningún mensaje del equipo revisor sin leer EN ESA VENTANA.
  | { ok: true; mensaje: MensajeHilo; carga: CargaArchivo; eraPrimerNoLeido: boolean }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "NO_PENDIENTE" }
  | { ok: false; motivo: "SIN_CONVERSACION" };

function estaPendienteFinalizada(carga: CargaArchivo): boolean {
  return carga.estado === "PENDIENTE_VISTO_BUENO" && carga.finalizadaEn !== null;
}

// Paso común a ambos caminos de envío: `notificadorId` y `ventanaCargaId` se copian SIEMPRE de la
// carga (nunca del cliente) y el lado lo fija el caso de uso. Carrera tolerada a propósito: el
// chequeo de estado y el INSERT no van en una transacción `Serializable`; un mensaje guardado
// milisegundos después de una aprobación concurrente no causa daño.
async function guardarMensajeSobreCarga(
  carga: CargaArchivo,
  autorId: string,
  contenido: string,
  dependencias: DependenciasEnvioRevisor,
): Promise<ResultadoEnviarMensajeRevisor> {
  const mensaje = await dependencias.repositorio.crear({
    cargaArchivoId: carga.id,
    ventanaCargaId: carga.ventanaCargaId,
    notificadorId: carga.usuarioId,
    autorId,
    ladoAutor: "REVISOR",
    contenido,
    creadoEn: new Date(),
  });

  // Anti-ráfaga POR VENTANA: "antes de este mensaje" = sin leer, de esta misma ventana y creado
  // antes que él. Un no leído en otra ventana no bloquea el aviso de esta; de dos envíos
  // concurrentes en la misma ventana, solo el primero dispara el correo.
  const noLeidosPrevios = await dependencias.repositorio.contarNoLeidosAnteriores({
    notificadorId: carga.usuarioId,
    ventanaCargaId: carga.ventanaCargaId,
    ladoAutor: "REVISOR",
    creadoAntesDe: mensaje.creadoEn,
  });

  return { ok: true, mensaje, carga, eraPrimerNoLeido: noLeidosPrevios === 0 };
}

// El revisor INICIA una conversación (o escribe sobre un archivo concreto) solo desde una carga
// `PENDIENTE_VISTO_BUENO` ya finalizada por el notificador.
export async function enviarMensajeRevisor(
  datos: { cargaArchivoId: string; autorId: string; contenido: string },
  dependencias: DependenciasEnvioRevisor,
): Promise<ResultadoEnviarMensajeRevisor> {
  const carga = await dependencias.repositorioCargas.obtenerPorId(datos.cargaArchivoId);

  if (!carga) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  if (!estaPendienteFinalizada(carga)) {
    return { ok: false, motivo: "NO_PENDIENTE" };
  }

  return guardarMensajeSobreCarga(carga, datos.autorId, datos.contenido, dependencias);
}

// En una conversación YA existente (par notificador + ventana con al menos un mensaje, de
// cualquier lado) el revisor puede seguir escribiendo aunque ya no haya archivo pendiente. El
// mensaje se asocia a la carga pendiente de ese par si existe; si no, a la carga del último mensaje
// del hilo. Se resuelve aquí, nunca con un id enviado por el cliente.
export async function enviarMensajeRevisorEnConversacion(
  datos: { ventanaCargaId: string; notificadorId: string; autorId: string; contenido: string },
  dependencias: DependenciasEnvioRevisor,
): Promise<ResultadoEnviarMensajeRevisor> {
  const [ultimoMensaje, cargaPendiente] = await Promise.all([
    dependencias.repositorio.obtenerUltimoMensaje(datos.notificadorId, datos.ventanaCargaId),
    dependencias.repositorioCargas.obtenerPendienteFinalizadaPorUsuarioYVentana(
      datos.notificadorId,
      datos.ventanaCargaId,
    ),
  ]);

  if (!ultimoMensaje) {
    return { ok: false, motivo: "SIN_CONVERSACION" };
  }

  const cargaDestino = cargaPendiente ?? (await dependencias.repositorioCargas.obtenerPorId(ultimoMensaje.cargaArchivoId));

  // Defensa: la FK `Restrict` impide borrar una carga con mensajes, así que no debería ocurrir.
  if (!cargaDestino) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  return guardarMensajeSobreCarga(cargaDestino, datos.autorId, datos.contenido, dependencias);
}
