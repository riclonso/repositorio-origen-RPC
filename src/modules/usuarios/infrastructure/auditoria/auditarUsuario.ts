import { logger } from "@/infrastructure/logging/logger";
import {
  registrarAuditoria,
  type AccionAuditoria,
  type EventoAuditoria,
  type MotivoAuditoria,
  type ResultadoAuditoria,
} from "@/infrastructure/logging/auditoria";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import type { RolUsuario } from "@/modules/usuarios/domain/entities/Usuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";

const LARGO_MAXIMO_USER_AGENT = 200;

export type DesenlaceAuditoria = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  usuarioObjetivoId?: string | null;
  usuarioObjetivoRut?: string | null;
  campos?: string[];
  rolAnterior?: RolUsuario;
  rolNuevo?: RolUsuario;
};

function extraerIp(peticion: Request): string | null {
  const reenviadas = peticion.headers.get("x-forwarded-for");
  const primera = reenviadas?.split(",")[0]?.trim();
  return primera && primera.length > 0 ? primera : null;
}

function extraerUserAgent(peticion: Request): string | null {
  const userAgent = peticion.headers.get("user-agent");
  return userAgent ? userAgent.slice(0, LARGO_MAXIMO_USER_AGENT) : null;
}

// El RUT del actor no viaja en el JWT (solo `sub` y `rol`), así que se resuelve aquí. La
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
    actorId: sesion.sub,
    actorRut: await resolverRutActor(sesion.sub),
    actorRol: sesion.rol,
    usuarioObjetivoId: desenlace.usuarioObjetivoId ?? null,
    usuarioObjetivoRut: desenlace.usuarioObjetivoRut ?? null,
    ...(desenlace.campos ? { campos: desenlace.campos } : {}),
    ...(desenlace.rolAnterior ? { rolAnterior: desenlace.rolAnterior } : {}),
    ...(desenlace.rolNuevo ? { rolNuevo: desenlace.rolNuevo } : {}),
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
