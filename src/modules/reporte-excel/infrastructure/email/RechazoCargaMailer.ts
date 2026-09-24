import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import type {
  DatosCorreoRechazoCarga,
  EnviadorNotificacionRechazoCarga,
} from "@/modules/reporte-excel/application/ports";

// Único lugar del sistema que sabe cómo se ve el correo de rechazo de una carga aprobada.
// Plantilla FIJA, mismo patrón de construcción que `SolicitudReemplazoMailer.ts`.

const ASUNTO = "Carga de archivo rechazada - Repositorio RPC - SEREMI de Salud Biobío";

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

function cuerpoTexto(saludo: string, enlace: string, datos: DatosCorreoRechazoCarga): string {
  const combinacion = `${datos.formatoExcelNombre} (${datos.anio})`;

  return `${saludo}

La carga "${datos.nombreArchivoOriginal}" de ${combinacion}, ya aprobada, fue rechazada por el equipo revisor.

Motivo: ${datos.motivo}

Puedes volver a subir un archivo para esta combinación desde el sistema.

Revisa el detalle en: ${enlace}

Este es un mensaje automático. No respondas a esta dirección.
`;
}

function cuerpoHtml(saludo: string, enlace: string, datos: DatosCorreoRechazoCarga): string {
  const enlaceSeguro = escaparHtml(enlace);
  const combinacion = `${escaparHtml(datos.formatoExcelNombre)} (${datos.anio})`;

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        La carga "<strong>${escaparHtml(datos.nombreArchivoOriginal)}</strong>" de ${combinacion}, ya aprobada, fue
        rechazada por el equipo revisor.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        <strong>Motivo:</strong> ${escaparHtml(datos.motivo)}
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
        Puedes volver a subir un archivo para esta combinación desde el sistema.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${enlaceSeguro}" style="display:inline-block;background-color:#006fb3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
          Ir al sistema
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

export const rechazoCargaMailer: EnviadorNotificacionRechazoCarga = {
  disponible: () => correoDisponible(),

  async enviarRechazo(datos) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const nombre = primerNombre(datos.destinatario.nombres);
    const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
    const enlace = `${configSmtp.urlBase}/notificador`;

    await enviarCorreo({
      para: datos.destinatario.email,
      asunto: ASUNTO,
      texto: cuerpoTexto(saludo, enlace, datos),
      html: cuerpoHtml(saludo, enlace, datos),
      cabeceras: CABECERAS,
    });
  },
};
