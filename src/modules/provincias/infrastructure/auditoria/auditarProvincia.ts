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

type AccionAuditoriaProvincia = Extract<
  AccionAuditoria,
  "PROVINCIA_CREADA" | "PROVINCIA_ACTUALIZADA" | "PROVINCIA_ELIMINADA"
>;

export type DesenlaceAuditoriaProvincia = {
  accion: AccionAuditoriaProvincia;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  provinciaId?: string | null;
  // Región de la provincia (en una edición, la región NUEVA; en una eliminación, la que tenía).
  regionId?: string | null;
  // Solo en una edición que movió la provincia de región (RF-28).
  regionAnteriorId?: string | null;
  // Solo NOMBRES de campos (p. ej. el campo en conflicto de un duplicado), nunca valores.
  campos?: string[];
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarRegion.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaProvincia,
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
    provinciaId: desenlace.provinciaId ?? null,
    regionId: desenlace.regionId ?? null,
    ...(desenlace.regionAnteriorId ? { regionAnteriorId: desenlace.regionAnteriorId } : {}),
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/provincias`. Se auditan los
// éxitos y los rechazos (403 sin permiso, 404 no encontrada, 409 duplicado, en uso o código con
// comunas); no las
// lecturas ni los 400 de validación (incluidos región inexistente y prefijo de código).
export function auditarProvincia(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaProvincia,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de provincias", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
