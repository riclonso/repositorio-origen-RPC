import { NextResponse } from "next/server";
import { z } from "zod";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import type { CampoUnico, Usuario } from "@/modules/usuarios/domain/entities/Usuario";

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "El usuario no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

// El `id` de ruta se valida como UUID: un identificador mal formado responde 404, no 500.
export const idUsuarioSchema = z.uuid();

// `perfilCodigo` identifica y `perfilNombre` se muestra: el cliente no arma etiquetas.
export type UsuarioDTO = Omit<Usuario, "createdAt"> & { createdAt: string };

// Ninguna respuesta incluye `contrasenaHash`: el tipo `Usuario` ya no lo contiene.
export function aUsuarioDTO(usuario: Usuario): UsuarioDTO {
  return { ...usuario, createdAt: usuario.createdAt.toISOString() };
}

type DetalleError = { campo?: string; codigo?: string };

// Formato de error uniforme para todo el mantenedor: { error, campo?, codigo? }.
export function respuestaError(
  mensaje: string,
  estado: number,
  detalle: DetalleError = {},
): NextResponse {
  return NextResponse.json({ error: mensaje, ...detalle }, { status: estado });
}

const MENSAJES_DUPLICADO: Record<CampoUnico, string> = {
  rut: "Ya existe un usuario registrado con ese RUT",
  email: "Ya existe un usuario registrado con ese email",
  username: "Ya existe un usuario registrado con ese nombre de usuario",
};

export function respuestaDuplicado(campo: CampoUnico): NextResponse {
  return respuestaError(MENSAJES_DUPLICADO[campo], 409, { campo, codigo: "DUPLICADO" });
}

// Un perfil inexistente o dado de baja es un dato inválido del formulario, no un fallo del
// servidor: se responde 400 sobre el campo y nunca se deja escalar la violación de FK a un 500.
export function respuestaPerfilInvalido(): NextResponse {
  return respuestaError("El perfil seleccionado no está disponible", 400, {
    campo: "perfilCodigo",
    codigo: "PERFIL_INVALIDO",
  });
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
