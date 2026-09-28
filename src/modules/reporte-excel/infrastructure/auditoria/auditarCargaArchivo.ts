import { logger } from "@/infrastructure/logging/logger";
import {
  registrarAuditoria,
  type AccionAuditoria,
  type EventoAuditoria,
  type MotivoAuditoria,
  type ResultadoAuditoria,
} from "@/infrastructure/logging/auditoria";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { extraerIp, extraerUserAgent } from "@/shared/utils/peticion";

export type DesenlaceAuditoriaCargaArchivo = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  formatoExcelId?: string | null;
  cargaArchivoId?: string | null;
  cantidadErrores?: number | null;
  // Dueño de la carga afectada. Se completa cuando el actor decide sobre la carga de un TERCERO
  // (`CARGA_ARCHIVO_RECHAZADA`, `CARGA_ARCHIVO_APROBADA`): las acciones propias del notificador
  // (registro/finalización) ya identifican al actor, no a un "objetivo" distinto de sí mismo.
  usuarioObjetivoId?: string | null;
  usuarioObjetivoRut?: string | null;
  // Solo se completa en `CARGA_ARCHIVO_RECHAZADA` (ampliación RF-20): de qué estado venía la carga.
  estadoOrigenRechazo?: "PENDIENTE_VISTO_BUENO" | "APROBADA" | null;
  // Solo se completa en `CARGA_ARCHIVO_RECHAZADA`: si fue una decisión unilateral del
  // ADMIN/REVISOR o el efecto automático de aprobar una solicitud de reemplazo (ver
  // `PATCH /api/dashboard/solicitudes-reemplazo/[id]`).
  origenRechazo?: "DECISION_UNILATERAL" | "REEMPLAZO_APROBADO" | null;
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarFormatoExcel.ts` y `auditarUsuario.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaCargaArchivo,
): Promise<void> {
  const evento: EventoAuditoria = {
    accion: desenlace.accion,
    resultado: desenlace.resultado,
    ...(desenlace.motivo ? { motivo: desenlace.motivo } : {}),
    actorTipo: "SESION",
    actorId: sesion.sub,
    actorRut: await resolverRutActor(sesion.sub),
    actorPerfil: sesion.perfil,
    usuarioObjetivoId: desenlace.usuarioObjetivoId ?? null,
    usuarioObjetivoRut: desenlace.usuarioObjetivoRut ?? null,
    formatoExcelId: desenlace.formatoExcelId ?? null,
    cargaArchivoId: desenlace.cargaArchivoId ?? null,
    cantidadErrores: desenlace.cantidadErrores ?? null,
    estadoOrigenRechazo: desenlace.estadoOrigenRechazo ?? null,
    origenRechazo: desenlace.origenRechazo ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/notificador/cargas`. Se
// auditan también los rechazos (formato no asignado, archivo inválido, estado inválido para dar
// visto bueno), no solo los éxitos. Nunca recibe contenido de celdas ni el binario del archivo.
export function auditarCargaArchivo(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaCargaArchivo,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de cargas de archivo", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
