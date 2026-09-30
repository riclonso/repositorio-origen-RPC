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

// RF-29: solo se audita la eliminación física (decisión explícita del requerimiento).
type AccionAuditoriaTipoEstablecimiento = Extract<AccionAuditoria, "TIPO_ESTABLECIMIENTO_ELIMINADO">;

export type DesenlaceAuditoriaTipoEstablecimiento = {
  accion: AccionAuditoriaTipoEstablecimiento;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  tipoEstablecimientoId?: string | null;
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
  desenlace: DesenlaceAuditoriaTipoEstablecimiento,
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
    tipoEstablecimientoId: desenlace.tipoEstablecimientoId ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/tipos-establecimiento`. Se
// auditan el éxito y los rechazos (403 sin permiso, 404 no encontrado, 409 en uso); no las lecturas
// ni los 400 de validación.
export function auditarTipoEstablecimiento(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaTipoEstablecimiento,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de tipos de establecimiento", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
