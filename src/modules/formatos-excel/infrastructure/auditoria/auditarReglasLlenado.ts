import { logger } from "@/infrastructure/logging/logger";
import {
  registrarAuditoria,
  type EventoAuditoria,
  type MotivoAuditoria,
  type ResultadoAuditoria,
} from "@/infrastructure/logging/auditoria";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { extraerIp, extraerUserAgent } from "@/shared/utils/peticion";

export type AccionReglasLlenado =
  | "REGLAS_LLENADO_SUBIDAS"
  | "REGLAS_LLENADO_REEMPLAZADAS"
  | "REGLAS_LLENADO_ELIMINADAS";

export type DesenlaceAuditoriaReglasLlenado = {
  accion: AccionReglasLlenado;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  formatoExcelId: string | null;
  extension?: string | null;
  tamanoBytes?: number | null;
};

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaReglasLlenado,
): Promise<void> {
  const actor = await prismaUsuarioRepository.obtenerPorId(sesion.sub);

  // Solo metadatos: nunca el contenido del archivo ni su nombre original.
  const evento: EventoAuditoria = {
    accion: desenlace.accion,
    resultado: desenlace.resultado,
    ...(desenlace.motivo ? { motivo: desenlace.motivo } : {}),
    actorTipo: "SESION",
    actorId: sesion.sub,
    actorRut: actor?.rut ?? null,
    actorPerfil: sesion.perfil,
    usuarioObjetivoId: null,
    usuarioObjetivoRut: null,
    formatoExcelId: desenlace.formatoExcelId,
    ...(desenlace.extension ? { extensionArchivo: desenlace.extension } : {}),
    ...(desenlace.tamanoBytes !== undefined && desenlace.tamanoBytes !== null ? { tamanoBytes: desenlace.tamanoBytes } : {}),
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// RF-45: punto único de armado del evento para los Route Handlers de reglas de llenado. Se auditan
// éxitos y rechazos (403, 404, 413, TIPO_INVALIDO); las descargas no se auditan.
export function auditarReglasLlenado(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaReglasLlenado,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de reglas de llenado", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
