import { logger, loggerAccesos } from "@/infrastructure/logging/logger";

// RF-07 (versión mínima). Espejo de `registrarAuditoria()`: mismo criterio de "no bloquear la
// respuesta HTTP por una escritura a disco" y "un fallo al loguear nunca tumba la petición".
export type EventoAcceso =
  | {
      evento: "login_exitoso";
      rut: string;
      usuarioId: string;
      ip: string | null;
    }
  | {
      evento: "login_fallido";
      rut: string;
      motivo: "credenciales_invalidas" | "usuario_inactivo" | "rut_invalido" | "cuenta_bloqueada";
      ip: string | null;
    };

// Nunca registrar la contraseña ni el token de sesión: el tipo `EventoAcceso` de arriba ni
// siquiera declara esos campos, así que filtrarlos por descuido no es posible.
export function registrarAcceso(evento: EventoAcceso): void {
  try {
    loggerAccesos.info("acceso", evento);
  } catch (error) {
    logger.error("Error al registrar evento de acceso", {
      evento: evento.evento,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
