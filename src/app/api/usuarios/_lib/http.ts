import { NextResponse } from "next/server";
import type { CampoUnico, Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import {
  exigirAdmin,
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdmin,
  type AccesoAdminORevisor,
} from "@/app/api/_lib/http";

// Helpers genéricos (guard de sesión, formato de error, id de ruta) viven en
// `app/api/_lib/http.ts` y se reexportan aquí sin cambiar los imports existentes del mantenedor.
export {
  exigirAdmin,
  exigirAdminORevisor,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdmin,
  type AccesoAdminORevisor,
};

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "El usuario no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

// El `id` de ruta se valida como UUID: un identificador mal formado responde 404, no 500.
export const idUsuarioSchema = idRutaSchema;

// `perfilCodigo` identifica y `perfilNombre` se muestra: el cliente no arma etiquetas.
export type UsuarioDTO = Omit<Usuario, "createdAt"> & { createdAt: string };

// Ninguna respuesta incluye `contrasenaHash`: el tipo `Usuario` ya no lo contiene.
export function aUsuarioDTO(usuario: Usuario): UsuarioDTO {
  return { ...usuario, createdAt: usuario.createdAt.toISOString() };
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

// Mismo criterio que `respuestaPerfilInvalido`, para un formato de archivo inexistente o dado
// de baja entre los `formatosExcelIds` enviados.
export function respuestaFormatoExcelInvalido(): NextResponse {
  return respuestaError("Uno de los formatos de archivo seleccionados no está disponible", 400, {
    campo: "formatosExcelIds",
    codigo: "FORMATO_INVALIDO",
  });
}

// Un actor con acceso al mantenedor (ADMIN o REVISOR_REPOSITORIO) pero sin perfil ADMIN, que
// intenta operar sobre una cuenta ADMIN o asignar el perfil ADMIN a alguien. Distinto de
// `respuestaSinAcceso(403)`: ese responde "no tienes acceso al mantenedor", este "tienes acceso
// pero no a esta cuenta/valor de perfil".
export function respuestaPerfilAdminRestringido(): NextResponse {
  return respuestaError(
    "No tienes permisos para esta acción sobre una cuenta con perfil administrador",
    403,
    { codigo: "PERFIL_ADMIN_RESTRINGIDO" },
  );
}
