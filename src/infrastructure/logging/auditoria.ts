import { logger, loggerAuditoria } from "@/infrastructure/logging/logger";

export type AccionAuditoria =
  | "USUARIO_CREADO"
  | "USUARIO_ACTUALIZADO"
  | "USUARIO_ACTIVADO"
  | "USUARIO_DESACTIVADO"
  | "CONTRASENA_RESTABLECIDA";

export type ResultadoAuditoria = "EXITO" | "RECHAZADO";

export type MotivoAuditoria =
  | "DUPLICADO"
  | "NO_ENCONTRADO"
  | "AUTO_OPERACION"
  | "ULTIMO_ADMIN"
  | "SIN_PERMISO";

// Ningún campo de este evento admite contraseñas, hashes, fragmentos ni longitudes de
// contraseña: de una operación sobre credenciales solo se registra quién, a quién y cuándo.
export type EventoAuditoria = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  actorId: string;
  actorRut: string | null;
  actorRol: string;
  usuarioObjetivoId: string | null;
  usuarioObjetivoRut: string | null;
  campos?: string[];
  rolAnterior?: string;
  rolNuevo?: string;
  ip: string | null;
  userAgent: string | null;
};

// No se hace await: el transporte de archivo de Winston es fire and forget y bloquear la
// respuesta HTTP por una escritura a disco no aporta nada. Un fallo al escribir el log jamás
// puede tumbar la petición, por eso el try/catch.
export function registrarAuditoria(evento: EventoAuditoria): void {
  try {
    loggerAuditoria.info("auditoria", evento);
  } catch (error) {
    logger.error("Error al registrar evento de auditoría", {
      accion: evento.accion,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
