import { logger } from "@/infrastructure/logging/logger";
import {
  registrarAuditoria,
  type AccionAuditoria,
  type EventoAuditoria,
  type MotivoAuditoria,
  type ResultadoAuditoria,
} from "@/infrastructure/logging/auditoria";
import { extraerIp, extraerUserAgent } from "@/shared/utils/peticion";

// Espeja a `auditarUsuario.ts`, pero con un actor anónimo: quien pide recuperar su contraseña
// no tiene sesión. Se invoca desde el Route Handler y no desde `application/`, siguiendo la
// decisión ya sancionada del proyecto (el evento incluye IP y user agent, que `application/` no
// debe conocer).
//
// Nunca se registra el token, ningún fragmento suyo, su hash, la contraseña, su hash, su
// longitud NI la dirección de correo tecleada: `auditoria.txt` no debe acumular direcciones de
// personas que ni siquiera son usuarias del sistema. Para investigar un sondeo alcanza con la
// IP y la frecuencia.
//
// A diferencia de la respuesta HTTP, el log SÍ distingue los motivos internos: el archivo no es
// público y esa distinción es lo que hace posible el soporte ("no me llegó" es muy distinto si
// fue CUENTA_INACTIVA o ENVIO_FALLIDO).

export type DesenlaceRecuperacion = {
  accion: Extract<AccionAuditoria, "RECUPERACION_SOLICITADA" | "RECUPERACION_COMPLETADA">;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  usuarioObjetivoId?: string | null;
  usuarioObjetivoRut?: string | null;
};

// Los datos del borde se leen del `Request` ANTES de entrar al callback de `after()` y se pasan
// por closure, porque el trabajo diferido corre cuando la respuesta ya se emitió.
export type ContextoPeticion = {
  ip: string | null;
  userAgent: string | null;
};

export function contextoDePeticion(peticion: Request): ContextoPeticion {
  return { ip: extraerIp(peticion), userAgent: extraerUserAgent(peticion) };
}

export function auditarRecuperacion(
  contexto: ContextoPeticion,
  desenlace: DesenlaceRecuperacion,
): void {
  try {
    const evento: EventoAuditoria = {
      accion: desenlace.accion,
      resultado: desenlace.resultado,
      ...(desenlace.motivo ? { motivo: desenlace.motivo } : {}),
      actorTipo: "ANONIMO",
      actorId: null,
      actorRut: null,
      actorPerfil: null,
      usuarioObjetivoId: desenlace.usuarioObjetivoId ?? null,
      usuarioObjetivoRut: desenlace.usuarioObjetivoRut ?? null,
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    };

    registrarAuditoria(evento);
  } catch (error) {
    logger.error("Error al construir el evento de auditoría de recuperación", {
      accion: desenlace.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
