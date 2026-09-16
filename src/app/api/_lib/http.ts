import { NextResponse } from "next/server";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";

// Helpers HTTP genéricos, compartidos por los recursos ADMIN-only de `/api/`. Lo específico de
// cada recurso (DTO, idSchema, mensajes de duplicado) vive en su `_lib` local.
//
// NOTA: `app/api/usuarios/_lib/http.ts` mantiene su propia copia de estos helpers a propósito, para
// no arriesgar una regresión en el mantenedor de usuarios ya en producción; no se refactorizó.

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

type DetalleError = { campo?: string; codigo?: string };

// Formato de error uniforme: { error, campo?, codigo? }.
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

// El guard vive en cada Route Handler y no en el matcher de `src/proxy.ts`: el proxy responde con
// un redirect a /login y un fetch del cliente recibiría HTML donde espera JSON.
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
