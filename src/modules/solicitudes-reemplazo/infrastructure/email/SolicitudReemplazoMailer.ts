import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import type {
  DatosCorreoRevisionSolicitudReemplazo,
  EnviadorNotificacionSolicitudReemplazo,
} from "@/modules/solicitudes-reemplazo/application/ports";

// Único lugar del sistema que sabe cómo se ve el correo de resultado de una solicitud de
// reemplazo. Plantilla FIJA (no enriquecida/configurable, a diferencia de las alertas de
// ventanas-carga), mismo patrón de construcción que `EnlaceContrasenaMailer.ts`.

const ASUNTO: Record<DatosCorreoRevisionSolicitudReemplazo["estado"], string> = {
  APROBADA: "Solicitud de reemplazo aprobada - Repositorio RPC - SEREMI de Salud Biobío",
  RECHAZADA: "Solicitud de reemplazo rechazada - Repositorio RPC - SEREMI de Salud Biobío",
};

// Mismas cabeceras que `EnlaceContrasenaMailer.ts`, para no gatillar respuestas automáticas de
// vacaciones contra la casilla remitente.
const CABECERAS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

function primerNombre(nombres: string): string {
  return nombres.trim().split(/\s+/)[0] ?? "";
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type CopyResultado = {
  intro: string;
  cierre: string;
};

function copiaSegunResultado(datos: DatosCorreoRevisionSolicitudReemplazo): CopyResultado {
  const combinacion = `${datos.formatoExcelNombre} (${datos.anio})`;

  if (datos.estado === "APROBADA") {
    return {
      intro: `Tu solicitud para reemplazar la carga "${datos.nombreArchivoOriginal}" de ${combinacion} fue aprobada. Ya puedes subir el archivo de reemplazo desde el sistema.`,
      cierre: "El enlace de reemplazo tiene una vigencia limitada: si no lo usas a tiempo, deberás solicitarlo nuevamente.",
    };
  }

  return {
    intro: `Tu solicitud para reemplazar la carga "${datos.nombreArchivoOriginal}" de ${combinacion} fue rechazada.`,
    cierre: datos.comentarioRevision
      ? `Comentario de quien revisó la solicitud: "${datos.comentarioRevision}"`
      : "Si tienes dudas sobre esta decisión, contacta al administrador o al revisor del repositorio.",
  };
}

function cuerpoTexto(saludo: string, enlace: string, copia: CopyResultado): string {
  return `${saludo}

${copia.intro}

${copia.cierre}

Revisa el detalle en: ${enlace}

Este es un mensaje automático. No respondas a esta dirección.
`;
}

function cuerpoHtml(saludo: string, enlace: string, copia: CopyResultado): string {
  const enlaceSeguro = escaparHtml(enlace);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escaparHtml(copia.intro)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">${escaparHtml(copia.cierre)}</p>
      <p style="margin:0 0 24px;">
        <a href="${enlaceSeguro}" style="display:inline-block;background-color:#006fb3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
          Ver mis solicitudes
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#4a4a4a;">
        Si el botón no funciona, copia y pega esta dirección en tu navegador:<br />
        <span style="word-break:break-all;">${enlaceSeguro}</span>
      </p>
      <p style="margin:0;font-size:13px;color:#4a4a4a;">
        Este es un mensaje automático. No respondas a esta dirección.
      </p>
    </div>
  </body>
</html>
`;
}

export const solicitudReemplazoMailer: EnviadorNotificacionSolicitudReemplazo = {
  disponible: () => correoDisponible(),

  async enviarResultadoRevision(datos) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const nombre = primerNombre(datos.destinatario.nombres);
    const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
    const enlace = `${configSmtp.urlBase}/notificador/solicitudes`;
    const copia = copiaSegunResultado(datos);

    await enviarCorreo({
      para: datos.destinatario.email,
      asunto: ASUNTO[datos.estado],
      texto: cuerpoTexto(saludo, enlace, copia),
      html: cuerpoHtml(saludo, enlace, copia),
      cabeceras: CABECERAS,
    });
  },
};
