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

export type DesenlaceAuditoria = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  usuarioObjetivoId?: string | null;
  usuarioObjetivoRut?: string | null;
  campos?: string[];
  perfilAnterior?: string;
  perfilNuevo?: string;
  formatosAgregados?: string[];
  formatosQuitados?: string[];
};

// El RUT del actor no viaja en el JWT (solo `sub` y `perfil`), así que se resuelve aquí. La
// consulta ocurre fuera del camino de respuesta para no penalizar la petición.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoria,
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
    ...(desenlace.campos ? { campos: desenlace.campos } : {}),
    ...(desenlace.perfilAnterior ? { perfilAnterior: desenlace.perfilAnterior } : {}),
    ...(desenlace.perfilNuevo ? { perfilNuevo: desenlace.perfilNuevo } : {}),
    ...(desenlace.formatosAgregados?.length ? { formatosAgregados: desenlace.formatosAgregados } : {}),
    ...(desenlace.formatosQuitados?.length ? { formatosQuitados: desenlace.formatosQuitados } : {}),
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los cinco Route Handlers del mantenedor.
export function auditarUsuario(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoria,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
