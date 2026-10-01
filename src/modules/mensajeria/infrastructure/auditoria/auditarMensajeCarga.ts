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

const ACCION = "MENSAJE_CARGA_ENVIADO" as const;

// Nunca recibe el contenido del mensaje ni su longitud: solo metadatos estructurados. El lado
// (revisor o notificador) queda implícito en `actorPerfil`.
export type DesenlaceAuditoriaMensajeCarga = {
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  cargaArchivoId?: string | null;
  ventanaCargaId?: string | null;
  mensajeCargaId?: string | null;
  // El notificador del hilo, solo cuando actúa el equipo revisor.
  usuarioObjetivoId?: string | null;
  usuarioObjetivoRut?: string | null;
};

// El RUT del actor no viaja en el JWT, así que se resuelve aquí, fuera del camino de respuesta.
// Mismo patrón que `auditarCargaArchivo.ts`.
async function resolverRutActor(actorId: string): Promise<string | null> {
  const actor = await prismaUsuarioRepository.obtenerPorId(actorId);
  return actor?.rut ?? null;
}

async function construirYRegistrar(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaMensajeCarga,
): Promise<void> {
  const evento: EventoAuditoria = {
    accion: ACCION,
    resultado: desenlace.resultado,
    ...(desenlace.motivo ? { motivo: desenlace.motivo } : {}),
    actorTipo: "SESION",
    actorId: sesion.sub,
    actorRut: await resolverRutActor(sesion.sub),
    actorPerfil: sesion.perfil,
    usuarioObjetivoId: desenlace.usuarioObjetivoId ?? null,
    usuarioObjetivoRut: desenlace.usuarioObjetivoRut ?? null,
    cargaArchivoId: desenlace.cargaArchivoId ?? null,
    ventanaCargaId: desenlace.ventanaCargaId ?? null,
    mensajeCargaId: desenlace.mensajeCargaId ?? null,
    ip: extraerIp(peticion),
    userAgent: extraerUserAgent(peticion),
  };

  registrarAuditoria(evento);
}

// Punto único de armado del evento `MENSAJE_CARGA_ENVIADO` (RF-31), en ambas direcciones. Se
// auditan los éxitos y los rechazos (403, 404, 409); no las lecturas, las marcas de leído ni los
// 400 de validación.
export function auditarMensajeCarga(
  sesion: SesionPayload,
  peticion: Request,
  desenlace: DesenlaceAuditoriaMensajeCarga,
): void {
  void construirYRegistrar(sesion, peticion, desenlace).catch((error: unknown) => {
    logger.error("Error al construir el evento de auditoría de mensajes de carga", {
      accion: ACCION,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
