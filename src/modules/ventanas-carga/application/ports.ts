// Puertos técnicos del módulo `ventanas-carga`, mismo criterio que `modules/auth/application/ports.ts`:
// interfaces que `application/` conoce, implementadas por `infrastructure/`.

export type ParametrosCorreoAlerta = {
  destinatarioEmail: string;
  asunto: string;
  // HTML ya sanitizado con `sanitizarMensajeResueltoHtml`. Este puerto no sanitiza nada, solo
  // envía.
  html: string;
};

export interface EnviadorCorreoAlerta {
  // `false` cuando el relay SMTP no está configurado, mismo criterio que
  // `EnviadorCorreoRecuperacion.disponible()` (RF-10). Usado por la vista de detalle para generar
  // la previsualización del mensaje aunque el correo no esté configurado (la URL del enlace no
  // puede resolverse en ese caso).
  disponible(): boolean;
  // Lanza si el envío falla; quien llama decide si reintenta (`EjecutarEnvioAutomaticoAlertas`)
  // o no (envío manual, masivo e individual, sin reintento).
  enviar(parametros: ParametrosCorreoAlerta): Promise<void>;
  // URL real del enlace al sistema (`{urlBase}/notificador`), SIEMPRE construida desde la config
  // del servidor, nunca desde una cabecera de la petición (ver `AlertaVentanaMailer.ts`). Vive en
  // este puerto y no como función suelta de infraestructura importada directamente: `application/`
  // no puede invocar `infrastructure/` fuera de una dependencia inyectada, mismo criterio que el
  // resto del proyecto (ver `CLAUDE.md`, sección Arquitectura).
  construirUrlEnlaceSistema(): string;
}
