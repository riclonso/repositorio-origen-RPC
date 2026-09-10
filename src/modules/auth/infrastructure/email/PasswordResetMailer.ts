import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import { HORAS_VIGENCIA_TOKEN } from "@/modules/auth/domain/entities/PasswordResetToken";
import type { EnviadorCorreoRecuperacion } from "@/modules/auth/application/ports";

// Único lugar del sistema que sabe cómo se ve el correo de recuperación y cómo se arma la URL
// del enlace.

const ASUNTO = "Restablecer tu contraseña - Intranet SEREMI de Salud Biobío";

// Cabeceras para no gatillar respuestas automáticas de vacaciones contra la casilla remitente.
const CABECERAS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

// Solo el nombre de pila. Las casillas del padrón son personales, así que personalizar el
// saludo ayuda contra el phishing sin exponer a nadie. El correo no lleva RUT, nombre de
// usuario, perfil, contraseña ni la dirección de destino repetida en el cuerpo.
function primerNombre(nombres: string): string {
  return nombres.trim().split(/\s+/)[0] ?? "";
}

// El enlace se construye SIEMPRE desde `configSmtp.urlBase` (APP_URL) y JAMÁS desde la cabecera
// `Host` de la petición: derivarlo del request es el vector clásico de host header poisoning,
// donde el atacante pide la recuperación de una cuenta ajena con un Host falso y el correo
// legítimo llega al titular con un enlace que entrega el token al atacante.
function construirEnlace(urlBase: string, token: string): string {
  return `${urlBase}/recuperar/confirmar?token=${encodeURIComponent(token)}`;
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cuerpoTexto(saludo: string, enlace: string): string {
  return `${saludo}

Recibimos una solicitud para restablecer la contraseña de tu cuenta en la
Intranet de la SEREMI de Salud de la Región del Biobío.

Para elegir una contraseña nueva, abre este enlace:

${enlace}

El enlace vence en ${HORAS_VIGENCIA_TOKEN} horas y sirve una sola vez.

Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual sigue
funcionando y nadie puede cambiarla sin abrir el enlace.

Este es un mensaje automático. No respondas a esta dirección.
`;
}

// Sin imágenes remotas (los clientes las bloquean y son un pixel de rastreo), sin CSS ni
// fuentes externas, sin adjuntos. La URL completa aparece además en texto, para quien tenga el
// HTML desactivado o desconfíe del botón.
function cuerpoHtml(saludo: string, enlace: string): string {
  const enlaceSeguro = escaparHtml(enlace);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en la Intranet de la
        SEREMI de Salud de la Región del Biobío.
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
        Para elegir una contraseña nueva, abre este enlace:
      </p>
      <p style="margin:0 0 24px;">
        <a href="${enlaceSeguro}" style="display:inline-block;background-color:#006fb3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
          Elegir una contraseña nueva
        </a>
      </p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#4a4a4a;">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br />
        <span style="word-break:break-all;">${enlaceSeguro}</span>
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        El enlace vence en ${HORAS_VIGENCIA_TOKEN} horas y sirve una sola vez.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual sigue
        funcionando y nadie puede cambiarla sin abrir el enlace.
      </p>
      <p style="margin:0;font-size:13px;color:#4a4a4a;">
        Este es un mensaje automático. No respondas a esta dirección.
      </p>
    </div>
  </body>
</html>
`;
}

export const passwordResetMailer: EnviadorCorreoRecuperacion = {
  disponible: () => correoDisponible(),

  async enviar(destinatario, token) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const nombre = primerNombre(destinatario.nombres);
    const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
    const enlace = construirEnlace(configSmtp.urlBase, token);

    await enviarCorreo({
      para: destinatario.email,
      asunto: ASUNTO,
      texto: cuerpoTexto(saludo, enlace),
      html: cuerpoHtml(saludo, enlace),
      cabeceras: CABECERAS,
    });
  },
};
