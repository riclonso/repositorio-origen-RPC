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

export type DesenlaceAuditoriaSolicitudReemplazo = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  cargaArchivoId?: string | null;
  solicitudReemplazoId?: string | null;
  estadoSolicitud?: "APROBADA" | "RECHAZADA" | null;
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarCargaArchivo.ts`/`auditarUsuario.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaSolicitudReemplazo,
): Promise<void> {
  const evento: EventoAuditoria = {
    accion: desenlace.accion,
    resultado: desenlace.resultado,
    ...(desenlace.motivo ? { motivo: desenlace.motivo } : {}),
    actorTipo: "SESION",
    actorId: sesion.sub,
    actorRut: await resolverRutActor(sesion.sub),
    actorPerfil: sesion.perfil,
    usuarioObjetivoId: null,
    usuarioObjetivoRut: null,
    cargaArchivoId: desenlace.cargaArchivoId ?? null,
    solicitudReemplazoId: desenlace.solicitudReemplazoId ?? null,
    estadoSolicitud: desenlace.estadoSolicitud ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/notificador/solicitudes-reemplazo`
// y `/api/dashboard/solicitudes-reemplazo`. Se auditan también los rechazos de negocio (solicitud
// duplicada, ya resuelta, carga no vigente), no solo los éxitos. Nunca recibe el texto libre de
// `motivo` (de la solicitud) ni de `comentarioRevision`.
export function auditarSolicitudReemplazo(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaSolicitudReemplazo,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de solicitudes de reemplazo", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
