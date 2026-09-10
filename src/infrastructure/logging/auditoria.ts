import { logger, loggerAuditoria } from "@/infrastructure/logging/logger";

export type AccionAuditoria =
  | "USUARIO_CREADO"
  | "USUARIO_ACTUALIZADO"
  | "USUARIO_ACTIVADO"
  | "USUARIO_DESACTIVADO"
  | "CONTRASENA_RESTABLECIDA"
  | "RECUPERACION_SOLICITADA"
  | "RECUPERACION_COMPLETADA";

// "SIN_EFECTO" no es un rechazo: la petición se aceptó y respondió con normalidad, pero no
// produjo ningún cambio (la cuenta no existía, estaba inactiva, agotó su cupo). Es la única
// forma de dejar registro de un camino que hacia fuera es indistinguible del exitoso.
export type ResultadoAuditoria = "EXITO" | "RECHAZADO" | "SIN_EFECTO";

export type MotivoAuditoria =
  | "DUPLICADO"
  | "NO_ENCONTRADO"
  | "AUTO_OPERACION"
  | "ULTIMO_ADMIN"
  | "SIN_PERMISO"
  | "CUENTA_INEXISTENTE"
  | "CUENTA_INACTIVA"
  | "LIMITE_ALCANZADO"
  | "LIMITE_IP"
  | "TOKEN_INVALIDO"
  | "ENVIO_FALLIDO"
  | "SIN_CONFIGURACION";

// Ningún campo de este evento admite contraseñas, hashes, fragmentos ni longitudes de
// contraseña: de una operación sobre credenciales solo se registra quién, a quién y cuándo.
// Tampoco admite tokens de recuperación, sus hashes ni la dirección de correo tecleada en un
// formulario público: `auditoria.txt` no debe acumular direcciones de personas que ni siquiera
// son usuarias del sistema.
export type EventoAuditoria = {
  accion: AccionAuditoria;
  resultado: ResultadoAuditoria;
  motivo?: MotivoAuditoria;
  // El actor es anulable porque hay acciones anónimas por definición: quien pide recuperar su
  // contraseña no tiene sesión. `actorTipo` distingue ambos casos sin ambigüedad.
  actorTipo: "SESION" | "ANONIMO";
  actorId: string | null;
  actorRut: string | null;
  actorPerfil: string | null;
  usuarioObjetivoId: string | null;
  usuarioObjetivoRut: string | null;
  campos?: string[];
  // Códigos de perfil, no nombres visibles: si mañana renombran el perfil, el histórico
  // sigue siendo interpretable.
  perfilAnterior?: string;
  perfilNuevo?: string;
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
