import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import type { ContextoEnlace } from "@/modules/auth/domain/entities/PasswordResetToken";
import type {
  EnviadorCorreoRecuperacion,
  OpcionesEnlaceContrasena,
} from "@/modules/auth/application/ports";

// Único lugar del sistema que sabe cómo se ve el correo del enlace de contraseña y cómo se arma
// la URL. Sirve a los dos contextos: ACTIVACION (cuenta recién creada que fija su primera
// contraseña) y RECUPERACION (contraseña olvidada o restablecida). El comportamiento de
// seguridad es idéntico; solo cambian el asunto y el copy.

const ASUNTO: Record<ContextoEnlace, string> = {
  activacion: "Activa tu cuenta - Repositorio RPC - SEREMI de Salud Biobío",
  recuperacion: "Restablecer tu contraseña - Repositorio RPC - SEREMI de Salud Biobío",
};

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
// donde el atacante pide el enlace de una cuenta ajena con un Host falso y el correo legítimo
// llega al titular con un enlace que entrega el token al atacante. El `contexto` viaja en la URL
// para que la pantalla de confirmación muestre el título correcto; es cosmético.
function construirEnlace(urlBase: string, token: string, contexto: ContextoEnlace): string {
  return `${urlBase}/recuperar/confirmar?token=${encodeURIComponent(token)}&contexto=${contexto}`;
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Texto según contexto. Ambos mensajes identifican explícitamente al sistema Repositorio RPC para
// que la persona destinataria pueda reconocer el origen legítimo del enlace.
type CopyEnlace = {
  intro: string;
  llamado: string;
  etiquetaBoton: string;
  vigencia: string;
  cierre: string;
};

function copiaSegunContexto(contexto: ContextoEnlace, horasVigencia: number): CopyEnlace {
  if (contexto === "activacion") {
    return {
      intro:
        "Se creó una cuenta para ti en el sistema Repositorio RPC - SEREMI de Salud Biobío.",
      llamado: "Para crear tu contraseña y activar tu cuenta, abre este enlace:",
      etiquetaBoton: "Crear mi contraseña",
      vigencia: `El enlace vence en ${horasVigencia} horas y sirve una sola vez.`,
      cierre:
        "Si no esperabas esta cuenta, ignora este mensaje: sin abrir el enlace no se activa nada.",
    };
  }

  return {
    intro:
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta en el sistema Repositorio RPC - SEREMI de Salud Biobío.",
    llamado: "Para elegir una contraseña nueva, abre este enlace:",
    etiquetaBoton: "Elegir una contraseña nueva",
    vigencia: `El enlace vence en ${horasVigencia} horas y sirve una sola vez.`,
    cierre:
      "Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual sigue funcionando y nadie puede cambiarla sin abrir el enlace.",
  };
}

function cuerpoTexto(saludo: string, enlace: string, copia: CopyEnlace): string {
  return `${saludo}

${copia.intro}

${copia.llamado}

${enlace}

${copia.vigencia}

${copia.cierre}

Este es un mensaje automático. No respondas a esta dirección.
`;
}

// Sin imágenes remotas (los clientes las bloquean y son un pixel de rastreo), sin CSS ni
// fuentes externas, sin adjuntos. La URL completa aparece además en texto, para quien tenga el
// HTML desactivado o desconfíe del botón.
function cuerpoHtml(saludo: string, enlace: string, copia: CopyEnlace): string {
  const enlaceSeguro = escaparHtml(enlace);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        ${escaparHtml(copia.intro)}
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
        ${escaparHtml(copia.llamado)}
      </p>
      <p style="margin:0 0 24px;">
        <a href="${enlaceSeguro}" style="display:inline-block;background-color:#006fb3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
          ${escaparHtml(copia.etiquetaBoton)}
        </a>
      </p>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:#4a4a4a;">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br />
        <span style="word-break:break-all;">${enlaceSeguro}</span>
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        ${escaparHtml(copia.vigencia)}
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        ${escaparHtml(copia.cierre)}
      </p>
      <p style="margin:0;font-size:13px;color:#4a4a4a;">
        Este es un mensaje automático. No respondas a esta dirección.
      </p>
    </div>
  </body>
</html>
`;
}

export const enlaceContrasenaMailer: EnviadorCorreoRecuperacion = {
  disponible: () => correoDisponible(),

  async enviar(destinatario, token, opciones: OpcionesEnlaceContrasena) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const nombre = primerNombre(destinatario.nombres);
    const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
    const enlace = construirEnlace(configSmtp.urlBase, token, opciones.contexto);
    const copia = copiaSegunContexto(opciones.contexto, opciones.horasVigencia);

    await enviarCorreo({
      para: destinatario.email,
      asunto: ASUNTO[opciones.contexto],
      texto: cuerpoTexto(saludo, enlace, copia),
      html: cuerpoHtml(saludo, enlace, copia),
      cabeceras: CABECERAS,
    });
  },
};
