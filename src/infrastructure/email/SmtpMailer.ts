import nodemailer, { type Transporter } from "nodemailer";
import { configSmtp } from "@/infrastructure/config/env";
import { adjuntarCorreoFallido } from "@/infrastructure/email/correoFallido";

// Infraestructura transversal: sabe de SMTP y de nodemailer, y nada de contraseñas ni de
// recuperación. Cuando otro módulo (por ejemplo el de reporte Excel/CSV) necesite notificar,
// reutiliza este archivo en vez de abrir su propio transporte.
//
// nodemailer es Node-only: este archivo jamás puede importarse desde un Client Component.

export type CorreoSaliente = {
  para: string;
  asunto: string;
  texto: string;
  html: string;
  // Cabeceras extra del mensaje (por ejemplo, supresión de respuestas automáticas).
  cabeceras?: Record<string, string>;
};

// Un relay colgado no puede dejar viva indefinidamente la tarea diferida que dispara el envío.
const TIEMPO_LIMITE_MS = 10_000;

const globalParaSmtp = globalThis as unknown as { transporteSmtp?: Transporter };

function crearTransporte(): Transporter | null {
  if (!configSmtp) {
    return null;
  }

  return nodemailer.createTransport({
    host: configSmtp.host,
    port: configSmtp.puerto,
    secure: configSmtp.seguro,
    ...(configSmtp.usuario && configSmtp.contrasena
      ? { auth: { user: configSmtp.usuario, pass: configSmtp.contrasena } }
      : {}),
    // `rejectUnauthorized: false` es el escape para un relay interno con certificado propio.
    // Nunca debe usarse contra un relay expuesto a internet.
    tls: { rejectUnauthorized: configSmtp.rechazarNoAutorizado },
    pool: true,
    maxConnections: 1,
    connectionTimeout: TIEMPO_LIMITE_MS,
    greetingTimeout: TIEMPO_LIMITE_MS,
    socketTimeout: TIEMPO_LIMITE_MS,
  });
}

// Exactamente el patrón de `prisma.ts`: UNA instancia por proceso, creada al importar el
// módulo, más una copia en `globalThis` solo en desarrollo para sobrevivir a la recarga en
// caliente.
//
// La instancia de módulo no es un detalle: el transporte es `pool: true`, así que crear uno por
// envío no agruparía nada y dejaría colgado un objeto con sus temporizadores y sus sockets en
// cada correo. Crearlo aquí es barato porque nodemailer no abre ninguna conexión hasta el
// primer `sendMail`.
const transporteSmtp: Transporter | null = globalParaSmtp.transporteSmtp ?? crearTransporte();

if (transporteSmtp && process.env.NODE_ENV !== "production") {
  globalParaSmtp.transporteSmtp = transporteSmtp;
}

export function correoDisponible(): boolean {
  return configSmtp !== null;
}

// Lanza si el envío falla; quien llama decide qué hacer con el error. No devuelve nada en éxito.
// El error lanzado es el del relay (su `message` puede citar la respuesta cruda del servidor y la
// dirección de destino) y lleva adjunto, no enumerable, el destinatario, el asunto y el texto plano
// que se intentó enviar. Por decisión del usuario (RF-44) ambos se registran en
// `logs/fallas-correo.txt`, visible solo para ADMIN, con todo enlace y `token=` ocultos (ver
// `correoFallido.ts` y `infrastructure/logging/fallasCorreo.ts`). Nunca deben llegar a una
// respuesta HTTP.
export async function enviarCorreo(correo: CorreoSaliente): Promise<void> {
  const intento = { para: correo.para, asunto: correo.asunto, texto: correo.texto };

  if (!transporteSmtp || !configSmtp) {
    throw adjuntarCorreoFallido(new Error("El envío de correo no está configurado"), intento);
  }

  try {
    await transporteSmtp.sendMail({
      from: configSmtp.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
      ...(correo.cabeceras ? { headers: correo.cabeceras } : {}),
    });
  } catch (error) {
    throw adjuntarCorreoFallido(error, intento);
  }
}
