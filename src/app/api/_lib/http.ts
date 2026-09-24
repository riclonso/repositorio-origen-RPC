import { NextResponse } from "next/server";
import { z } from "zod";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import {
  esPerfilAdministrador,
  esPerfilNotificador,
  esPerfilRevisorRepositorio,
} from "@/modules/perfiles/domain/entities/Perfil";

// Helpers genéricos, reutilizables por cualquier Route Handler bajo `app/api/**`. Los helpers
// específicos de un dominio (mensajes, DTOs, traducción de errores propios de ese módulo) viven
// en el `_lib/http.ts` de cada carpeta de API, que reexporta e importa de aquí.
//
// NOTA: `app/api/usuarios/_lib/http.ts` mantiene su propia copia de estos helpers a propósito, para
// no arriesgar una regresión en el mantenedor de usuarios ya en producción; no se refactorizó.

// Identificador de ruta genérico: cualquier recurso identificado por UUID lo reutiliza.
export const idRutaSchema = z.uuid();

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

type DetalleError = { campo?: string; codigo?: string };

// Formato de error uniforme para toda la API: { error, campo?, codigo? }.
export function respuestaError(
  mensaje: string,
  estado: number,
  detalle: DetalleError = {},
): NextResponse {
  return NextResponse.json({ error: mensaje, ...detalle }, { status: estado });
}

export type AccesoAdmin =
  | { ok: true; sesion: SesionPayload }
  | { ok: false; estado: 401 }
  | { ok: false; estado: 403; sesion: SesionPayload };

// El guard vive en cada Route Handler y no en el matcher de `src/proxy.ts`: el proxy responde
// con un redirect a /login y un fetch del cliente recibiría HTML donde espera JSON, además de
// que los casos de uso necesitan el id del actor.
export async function exigirAdmin(): Promise<AccesoAdmin> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    return { ok: false, estado: 401 };
  }

  if (!esPerfilAdministrador(sesion.perfil)) {
    return { ok: false, estado: 403, sesion };
  }

  return { ok: true, sesion };
}

export function respuestaSinAcceso(estado: 401 | 403): NextResponse {
  return estado === 401
    ? respuestaError("Debes iniciar sesión", 401)
    : respuestaError("No tienes permisos para realizar esta acción", 403);
}

export type AccesoNotificador =
  | { ok: true; sesion: SesionPayload }
  | { ok: false; estado: 401 }
  | { ok: false; estado: 403; sesion: SesionPayload };

// Guard para `/api/notificador/**`, mismo criterio que `exigirAdmin`: vive en cada Route Handler,
// no en el matcher de `src/proxy.ts`.
export async function exigirNotificador(): Promise<AccesoNotificador> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    return { ok: false, estado: 401 };
  }

  if (!esPerfilNotificador(sesion.perfil)) {
    return { ok: false, estado: 403, sesion };
  }

  return { ok: true, sesion };
}

export type AccesoSesion = { ok: true; sesion: SesionPayload } | { ok: false; estado: 401 };

// Guard mínimo: solo exige una sesión válida, sin exigir un perfil concreto. Lo usan endpoints
// de autoservicio sobre la PROPIA cuenta (p. ej. `/api/cuenta/**`), donde cualquier perfil
// autenticado tiene acceso por definición y la única autorización que importa es "es tu propia
// cuenta" (garantizada porque el `id` siempre sale de `sesion.sub`, nunca del cliente).
export async function exigirSesion(): Promise<AccesoSesion> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    return { ok: false, estado: 401 };
  }

  return { ok: true, sesion };
}

export type AccesoAdminORevisor =
  | { ok: true; sesion: SesionPayload }
  | { ok: false; estado: 401 }
  | { ok: false; estado: 403; sesion: SesionPayload };

// Guard para las cargas del tablero de seguimiento: visible tanto para ADMIN como para el perfil
// REVISOR_REPOSITORIO.
export async function exigirAdminORevisor(): Promise<AccesoAdminORevisor> {
  const sesion = await obtenerSesionActual();

  if (!sesion) {
    return { ok: false, estado: 401 };
  }

  if (!esPerfilAdministrador(sesion.perfil) && !esPerfilRevisorRepositorio(sesion.perfil)) {
    return { ok: false, estado: 403, sesion };
  }

  return { ok: true, sesion };
}
