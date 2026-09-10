import { NextResponse } from "next/server";
import { registrarIntento } from "@/infrastructure/rate-limit/LimitadorMemoria";
import { extraerIp } from "@/shared/utils/peticion";

// Helpers de los Route Handlers públicos y anónimos de `auth/`. No se reutiliza
// `app/api/usuarios/_lib/http.ts`: ese está acoplado a `exigirAdmin` y a los DTO del mantenedor,
// y aquí no hay sesión que exigir.

export const MENSAJE_EMAIL_INVALIDO = "Ingresa un email válido";
export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_TOKEN_INVALIDO =
  "El enlace no es válido o ya venció. Solicita uno nuevo.";
export const MENSAJE_LIMITE_SOLICITUDES =
  "Demasiadas solicitudes. Intenta nuevamente en unos minutos.";
export const MENSAJE_LIMITE_INTENTOS = "Demasiados intentos. Intenta nuevamente en unos minutos.";
export const MENSAJE_CUERPO_EXCESIVO = "La solicitud es demasiado grande.";

/**
 * Tope del cuerpo de las peticiones de estos endpoints, en bytes.
 *
 * Son endpoints PÚBLICOS y ANÓNIMOS: sin tope, cualquiera puede hacer que el proceso parsee
 * megabytes de JSON por petición. El cuerpo más grande que aceptan de verdad es un token de 43
 * caracteres más una contraseña de 72 bytes, así que 2 KiB sobran con holgura.
 */
export const MAXIMO_BYTES_CUERPO = 2048;

type DetalleError = { codigo?: string };

export type LecturaCuerpo =
  | { estado: "OK"; cuerpo: Record<string, unknown> | null }
  | { estado: "EXCEDE_TOPE" };

// Estas respuestas jamás se cachean: llevan el desenlace de una operación sobre credenciales.
const CABECERAS_SIN_CACHE = { "Cache-Control": "no-store" } as const;

export function respuestaOk(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200, headers: CABECERAS_SIN_CACHE });
}

export function respuestaError(
  mensaje: string,
  estado: number,
  detalle: DetalleError = {},
): NextResponse {
  return NextResponse.json(
    { error: mensaje, ...detalle },
    { status: estado, headers: CABECERAS_SIN_CACHE },
  );
}

export function respuestaLimite(mensaje: string, segundosEspera: number): NextResponse {
  return NextResponse.json(
    { error: mensaje },
    {
      status: 429,
      headers: { ...CABECERAS_SIN_CACHE, "Retry-After": String(segundosEspera) },
    },
  );
}

/**
 * Lee y parsea el cuerpo JSON de una petición pública sin superar un tope de bytes.
 *
 * Dos barreras: primero la cabecera `Content-Length`, que evita leer siquiera un byte del
 * cuerpo declarado como enorme; después un conteo mientras se lee, que cubre el caso de una
 * petición con `Transfer-Encoding: chunked` (sin `Content-Length`) o con una cabecera mentirosa.
 *
 * `cuerpo: null` cubre por igual "no es JSON" y "es JSON pero no un objeto": quien llama valida
 * con Zod y responde el mismo error de forma en los dos casos.
 */
export async function leerCuerpoJson(
  peticion: Request,
  maximoBytes: number = MAXIMO_BYTES_CUERPO,
): Promise<LecturaCuerpo> {
  const declarado = Number(peticion.headers.get("content-length"));

  if (Number.isFinite(declarado) && declarado > maximoBytes) {
    return { estado: "EXCEDE_TOPE" };
  }

  const texto = await leerTextoAcotado(peticion, maximoBytes);

  if (texto === null) {
    return { estado: "EXCEDE_TOPE" };
  }

  try {
    const analizado: unknown = JSON.parse(texto);

    return {
      estado: "OK",
      cuerpo:
        typeof analizado === "object" && analizado !== null && !Array.isArray(analizado)
          ? (analizado as Record<string, unknown>)
          : null,
    };
  } catch {
    return { estado: "OK", cuerpo: null };
  }
}

// Devuelve `null` en cuanto el cuerpo supera el tope, cancelando la lectura: nunca se acumula
// en memoria más de lo que el tope permite.
async function leerTextoAcotado(peticion: Request, maximoBytes: number): Promise<string | null> {
  if (!peticion.body) {
    return "";
  }

  const lector = peticion.body.getReader();
  // Decodificación por trozos (`stream: true`) para no partir un carácter multibyte que quede
  // a caballo entre dos trozos.
  const decodificador = new TextDecoder();
  let leidos = 0;
  let texto = "";

  for (;;) {
    const { done, value } = await lector.read();

    if (done) {
      return texto + decodificador.decode();
    }

    leidos += value.byteLength;

    if (leidos > maximoBytes) {
      await lector.cancel();
      return null;
    }

    texto += decodificador.decode(value, { stream: true });
  }
}

export type ControlLimiteIp =
  | { permitido: true; ip: string | null }
  | { permitido: false; ip: string; segundosEspera: number };

// Sin proxy verificado se usa un cupo compartido conservador; no se aceptan IPs
// declaradas por el cliente. Configurar TRUST_PROXY permite límites individuales.
export function controlarLimitePorIp(
  peticion: Request,
  ambito: string,
  maximoIntentos: number,
  ventanaMinutos: number,
): ControlLimiteIp {
  const ip = extraerIp(peticion);

  const clave = ip ?? "origen-no-verificado";
  const resultado = registrarIntento(ambito, clave, maximoIntentos, ventanaMinutos);

  return resultado.permitido
    ? { permitido: true, ip }
    : { permitido: false, ip: clave, segundosEspera: resultado.segundosEspera };
}
