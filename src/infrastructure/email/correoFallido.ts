// Correo que se intentó enviar y falló, adjunto al error que lanza `enviarCorreo()`. Permite que el
// registro de fallas de correo (`infrastructure/logging/fallasCorreo.ts`) muestre qué se intentó
// enviar sin que cada mailer tenga que separar la construcción del envío: `SmtpMailer.ts` es el
// único punto por el que pasa todo correo del sistema.
//
// Se adjunta como propiedad NO enumerable con un símbolo propio: el error original (con su `code`,
// `responseCode` y `command`) se conserva intacto para quien ya lo inspecciona, y un
// `JSON.stringify(error)` accidental no vuelca el cuerpo del correo.
//
// Módulo puro (sin Node ni nodemailer): lo pueden importar las pruebas unitarias sin abrir nada.

export type CorreoFallido = {
  para: string;
  asunto: string;
  // Cuerpo en texto plano tal como se intentó enviar. Puede contener enlaces con tokens: quien lo
  // registre DEBE pasarlo antes por `reemplazarEnlaces()`.
  texto: string;
};

const CLAVE_CORREO_FALLIDO = Symbol.for("repositorio-rem.correoFallido");

type ErrorConCorreo = Error & { [CLAVE_CORREO_FALLIDO]?: CorreoFallido };

// Devuelve el mismo error (o uno nuevo si lo lanzado no era un objeto) con el correo adjunto.
export function adjuntarCorreoFallido(error: unknown, correo: CorreoFallido): Error {
  const errorBase = error instanceof Error ? error : new Error(String(error));

  Object.defineProperty(errorBase, CLAVE_CORREO_FALLIDO, {
    value: correo,
    enumerable: false,
    configurable: true,
  });

  return errorBase;
}

export function correoFallidoDe(error: unknown): CorreoFallido | null {
  if (!(error instanceof Error)) return null;
  return (error as ErrorConCorreo)[CLAVE_CORREO_FALLIDO] ?? null;
}

// Cualquier URL (con esquema o empezando por `www.`) se reemplaza por "[enlace]". Es obligatorio
// antes de registrar un cuerpo: el correo de recuperación y el de enlace de contraseña llevan un
// token que permite fijar la contraseña de la cuenta.
const PATRON_ENLACE = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>"'`]+/gi;

export const MARCADOR_ENLACE = "[enlace]";

// Segunda barrera: un enlace sin esquema (p. ej. `localhost:3613/recuperar/confirmar?token=…`) no
// calza con `PATRON_ENLACE`, pero el valor de cualquier `token=` se oculta igual.
const PATRON_TOKEN = /\btoken=[^\s&<>"'`]+/gi;

export function ocultarTokens(texto: string): string {
  return texto.replace(PATRON_TOKEN, `token=${MARCADOR_ENLACE}`);
}

export function reemplazarEnlaces(texto: string): string {
  return ocultarTokens(texto.replace(PATRON_ENLACE, MARCADOR_ENLACE));
}
