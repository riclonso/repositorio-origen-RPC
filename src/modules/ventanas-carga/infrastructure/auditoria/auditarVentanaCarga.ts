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

export type DesenlaceAuditoriaVentanaCarga = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  ventanaCargaId?: string | null;
  anio?: number | null;
  fechaApertura?: Date | null;
  fechaVencimiento?: Date | null;
  tipoEliminacionVentana?: "HARD" | "SOFT" | null;
  publicada?: boolean | null;
  archivada?: boolean | null;
  formatoExcelId?: string | null;
  diasAnticipacionInicio?: number | null;
  intervaloRepeticionDias?: number | null;
  loteId?: string | null;
  destinatarioId?: string | null;
  cantidadExitos?: number | null;
  cantidadErrores?: number | null;
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarFormatoExcel.ts`/`auditarCargaArchivo.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaVentanaCarga,
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
    ventanaCargaId: desenlace.ventanaCargaId ?? null,
    anio: desenlace.anio ?? null,
    fechaApertura: desenlace.fechaApertura ? desenlace.fechaApertura.toISOString() : null,
    fechaVencimiento: desenlace.fechaVencimiento ? desenlace.fechaVencimiento.toISOString() : null,
    tipoEliminacionVentana: desenlace.tipoEliminacionVentana ?? null,
    publicada: desenlace.publicada ?? null,
    archivada: desenlace.archivada ?? null,
    formatoExcelId: desenlace.formatoExcelId ?? null,
    diasAnticipacionInicio: desenlace.diasAnticipacionInicio ?? null,
    intervaloRepeticionDias: desenlace.intervaloRepeticionDias ?? null,
    loteId: desenlace.loteId ?? null,
    destinatarioId: desenlace.destinatarioId ?? null,
    cantidadExitos: desenlace.cantidadExitos ?? null,
    cantidadErrores: desenlace.cantidadErrores ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de `/api/dashboard/ventanas-carga`. Se
// auditan también los rechazos (409 año duplicado, 400 rango inválido, 404 no encontrada, 403 sin
// permiso para eliminar), no solo los éxitos.
export function auditarVentanaCarga(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaVentanaCarga,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de ventanas de carga", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
