import { configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import { obtenerDestinatariosEquipoRevisor } from "@/modules/usuarios/infrastructure/destinatarios/obtenerDestinatariosEquipoRevisor";
import { escaparHtml } from "@/shared/utils/escaparHtml";
import type {
  DatosCorreoAvisoMensajeNuevo,
  DatosCorreoAvisoMensajeRevisores,
  EnviadorAvisoMensajeNuevo,
  EnviadorAvisoMensajeRevisores,
} from "@/modules/mensajeria/application/ports";

// Único lugar del sistema que sabe cómo se ven los correos de aviso de un mensaje nuevo (RF-31):
// del equipo revisor al notificador y, en sentido contrario, del notificador al equipo revisor.
// Plantilla FIJA, mismo patrón de construcción que `RechazoCargaMailer.ts`, con una diferencia
// deliberada: NUNCA lleva el contenido del mensaje ni su longitud (podría contener datos clínicos);
// solo avisa y lleva al sistema, donde se lee con sesión. Asuntos genéricos por el mismo motivo.

const ASUNTO = "Tienes un mensaje nuevo - Repositorio RPC - SEREMI de Salud Biobío";
// Neutro (RF-44): el destinatario puede ser el buzón compartido, no una persona.
const ASUNTO_REVISORES = "Respuesta nueva de un notificador - Repositorio RPC - SEREMI de Salud Biobío";
const SALUDO_EQUIPO_REVISOR = "Hola Equipo Revisor,";

// Mismas cabeceras que el resto de los correos del sistema, para no gatillar respuestas
// automáticas de vacaciones contra la casilla remitente.
const CABECERAS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

function primerNombre(nombres: string): string {
  return nombres.trim().split(/\s+/)[0] ?? "";
}

function saludoPersonal(nombres: string): string {
  const nombre = primerNombre(nombres);
  return nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
}

function exigirConfigSmtp(): NonNullable<typeof configSmtp> {
  if (!configSmtp) {
    throw new Error("El envío de correo no está configurado");
  }
  return configSmtp;
}

// Texto plano común: saludo, párrafo propio de cada aviso, enlace y pie.
function cuerpoTexto(saludo: string, parrafo: string, enlace: string): string {
  return `${saludo}

${parrafo}

Ingresa al sistema para leerlo y responder: ${enlace}

Este es un mensaje automático. No respondas a esta dirección.
`;
}

// Layout HTML común. `parrafoHtml` debe venir YA escapado por quien lo arma.
function cuerpoHtml(saludo: string, parrafoHtml: string, enlace: string): string {
  const enlaceSeguro = escaparHtml(enlace);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
        ${parrafoHtml} Ingresa al sistema
        para leerlo y responder.
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

function parrafoAvisoNotificador(datos: DatosCorreoAvisoMensajeNuevo, escapar: (valor: string) => string): string {
  return `Tienes un mensaje nuevo del equipo revisor sobre tu carga de ${escapar(datos.formatoExcelNombre)} (${datos.anio}).`;
}

// "{notificador} ({establecimiento}) respondió…": sin paréntesis si no tiene establecimiento. Sin
// RUT, sin email, sin nombre de archivo y sin contenido del mensaje.
function parrafoAvisoRevisores(
  datos: DatosCorreoAvisoMensajeRevisores,
  escapar: (valor: string) => string,
): string {
  const establecimiento = datos.establecimientoNombre ? ` (${escapar(datos.establecimientoNombre)})` : "";
  return `${escapar(datos.notificadorNombre)}${establecimiento} respondió en la conversación sobre ${escapar(datos.formatoExcelNombre)} (${datos.anio}).`;
}

const sinEscapar = (valor: string): string => valor;

export const avisoMensajeMailer: EnviadorAvisoMensajeNuevo = {
  disponible: () => correoDisponible(),

  async enviarAviso(datos) {
    const config = exigirConfigSmtp();
    const saludo = saludoPersonal(datos.destinatario.nombres);
    const enlace = `${config.urlBase}/notificador`;

    await enviarCorreo({
      para: datos.destinatario.email,
      asunto: ASUNTO,
      texto: cuerpoTexto(saludo, parrafoAvisoNotificador(datos, sinEscapar), enlace),
      html: cuerpoHtml(saludo, parrafoAvisoNotificador(datos, escaparHtml), enlace),
      cabeceras: CABECERAS,
    });
  },
};

// RF-31 (ampliación): aviso al equipo revisor. A quién se envía lo decide la regla única de
// `modules/usuarios/` (RF-44): buzón compartido si está configurado, o un destinatario por cada
// REVISOR_REPOSITORIO activo. Cada destinatario recibe su PROPIO correo, nunca todos en To/CC.
export const avisoMensajeRevisoresMailer: EnviadorAvisoMensajeRevisores = {
  disponible: () => correoDisponible(),

  resolverDestinatarios: obtenerDestinatariosEquipoRevisor,

  async enviarAviso(destinatario, datos) {
    const config = exigirConfigSmtp();
    const saludo = destinatario.tipo === "BUZON_COMPARTIDO" ? SALUDO_EQUIPO_REVISOR : saludoPersonal(destinatario.nombres);
    const enlace = `${config.urlBase}/revisor`;

    await enviarCorreo({
      para: destinatario.email,
      asunto: ASUNTO_REVISORES,
      texto: cuerpoTexto(saludo, parrafoAvisoRevisores(datos, sinEscapar), enlace),
      html: cuerpoHtml(saludo, parrafoAvisoRevisores(datos, escaparHtml), enlace),
      cabeceras: CABECERAS,
    });
  },
};
