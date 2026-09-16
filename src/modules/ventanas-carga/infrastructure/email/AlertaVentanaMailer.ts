import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import { htmlAsTextoPlano } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";
import type { EnviadorCorreoAlerta } from "@/modules/ventanas-carga/application/ports";

// Cabeceras para no gatillar respuestas automáticas de vacaciones contra la casilla remitente,
// mismo criterio que `PasswordResetMailer.ts`.
const CABECERAS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

// El enlace se construye SIEMPRE desde `configSmtp.urlBase` (APP_URL) y JAMÁS desde la cabecera
// `Host` de la petición: mismo criterio de seguridad documentado en
// `modules/auth/infrastructure/email/PasswordResetMailer.ts` (host header poisoning).
export const alertaVentanaMailer: EnviadorCorreoAlerta = {
  disponible: () => correoDisponible(),

  construirUrlEnlaceSistema(): string {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    return `${configSmtp.urlBase}/notificador`;
  },

  async enviar({ destinatarioEmail, asunto, html }) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    // `html` ya llega sanitizado con `sanitizarMensajeResueltoHtml` (etapa de envío); este mailer
    // no vuelve a sanearlo, solo genera el `text` alternativo a partir de él.
    await enviarCorreo({
      para: destinatarioEmail,
      asunto,
      texto: htmlAsTextoPlano(html),
      html,
      cabeceras: CABECERAS,
    });
  },
};
