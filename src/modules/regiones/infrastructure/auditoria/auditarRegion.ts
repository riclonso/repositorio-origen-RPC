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

type AccionAuditoriaRegion = Extract<
  AccionAuditoria,
  "REGION_CREADA" | "REGION_ACTUALIZADA" | "REGION_ELIMINADA"
>;

export type DesenlaceAuditoriaRegion = {
  accion: AccionAuditoriaRegion;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  regionId?: string | null;
  // Solo NOMBRES de campos (p. ej. el campo en conflicto de un duplicado), nunca valores.
  campos?: string[];
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarVentanaCarga.ts`/`auditarFormatoExcel.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaRegion,
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
    regionId: desenlace.regionId ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/regiones`. Se auditan los
// éxitos y los rechazos (403 sin permiso, 404 no encontrada, 409 duplicado o en uso); no las
// lecturas ni los 400 de validación.
export function auditarRegion(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaRegion,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de regiones", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
