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

// Datos de transporte capturados ANTES de responder: el desenlace del procesamiento se audita desde
// `after()`, cuando la respuesta ya salió.
export type TransporteAuditoria = { ip: string | null; userAgent: string | null };

export function capturarTransporte(peticion: Request): TransporteAuditoria {
  return { ip: extraerIp(peticion), userAgent: extraerUserAgent(peticion) };
}

// Solo metadatos estructurados: NUNCA contenido de celdas, el motivo de la solicitud ni el
// comentario de revisión (ni su longitud).
export type DesenlaceAuditoriaBioestadistica = {
  accion: Extract<
    AccionAuditoria,
    | "CARGA_BIOESTADISTICA_RECIBIDA"
    | "CARGA_BIOESTADISTICA_PROCESADA"
    | "SOLICITUD_REEMPLAZO_BIOESTADISTICA_CREADA"
    | "SOLICITUD_REEMPLAZO_BIOESTADISTICA_REVISADA"
  >;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  anio?: number | null;
  tipoArchivoBioestadistica?: string | null;
  cargaBioestadisticaId?: string | null;
  cargaReemplazadaId?: string | null;
  cantidadFilasDatos?: number | null;
  tamanoBytes?: number | null;
  solicitudReemplazoBioestadisticaId?: string | null;
  estadoSolicitud?: "APROBADA" | "RECHAZADA" | null;
  diasVigencia?: number | null;
};

// El RUT del actor no viaja en el JWT: se resuelve fuera del camino de respuesta, mismo patrón que
// `auditarSolicitudReemplazo`.
async function construirYRegistrar(
  sesion: SesionPayload,
  transporte: TransporteAuditoria,
  desenlace: DesenlaceAuditoriaBioestadistica,
): Promise<void> {
  const actor = await prismaUsuarioRepository.obtenerPorId(sesion.sub);

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
    anio: desenlace.anio ?? null,
    tipoArchivoBioestadistica: desenlace.tipoArchivoBioestadistica ?? null,
    cargaBioestadisticaId: desenlace.cargaBioestadisticaId ?? null,
    cargaReemplazadaId: desenlace.cargaReemplazadaId ?? null,
    cantidadFilasDatos: desenlace.cantidadFilasDatos ?? null,
    tamanoBytes: desenlace.tamanoBytes ?? null,
    solicitudReemplazoBioestadisticaId: desenlace.solicitudReemplazoBioestadisticaId ?? null,
    estadoSolicitud: desenlace.estadoSolicitud ?? null,
    diasVigencia: desenlace.diasVigencia ?? null,
    ip: transporte.ip,
    userAgent: transporte.userAgent,
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento para los Route Handlers de RF-37 (y el `after()` del
// procesamiento). Se auditan los éxitos y los rechazos de negocio; no las lecturas ni los 400 de
// validación de forma.
export function auditarBioestadistica(
  sesion: SesionPayload,
  transporte: TransporteAuditoria,
  desenlace: DesenlaceAuditoriaBioestadistica,
): void {
  void construirYRegistrar(sesion, transporte, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de Bioestadística", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
