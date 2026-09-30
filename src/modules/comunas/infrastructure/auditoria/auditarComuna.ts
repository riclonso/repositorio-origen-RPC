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

type AccionAuditoriaComuna = Extract<
  AccionAuditoria,
  "COMUNA_CREADA" | "COMUNA_ACTUALIZADA" | "COMUNA_ELIMINADA"
>;

export type DesenlaceAuditoriaComuna = {
  accion: AccionAuditoriaComuna;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  comunaId?: string | null;
  // Provincia de la comuna (en una edición, la provincia NUEVA; en una eliminación, la que tenía).
  provinciaId?: string | null;
  // Solo en una edición que movió la comuna de provincia.
  provinciaAnteriorId?: string | null;
  // Solo NOMBRES de campos (p. ej. el campo en conflicto de un duplicado), nunca valores.
  campos?: string[];
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarProvincia.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaComuna,
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
    ...(desenlace.campos ? { campos: desenlace.campos } : {}),
    comunaId: desenlace.comunaId ?? null,
    provinciaId: desenlace.provinciaId ?? null,
    ...(desenlace.provinciaAnteriorId
      ? { provinciaAnteriorId: desenlace.provinciaAnteriorId }
      : {}),
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/comunas`. Se auditan los
// éxitos y los rechazos (403 sin permiso, 404 no encontrada, 409 duplicado o en uso); no las
// lecturas ni los 400 de validación (incluidos provincia inexistente y prefijo de código).
export function auditarComuna(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaComuna,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de comunas", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
