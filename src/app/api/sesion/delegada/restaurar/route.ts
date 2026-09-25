import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { verificarSesion } from "@/modules/auth/infrastructure/auth/JwtService";
import {
  NOMBRE_COOKIE_SESION,
  NOMBRE_COOKIE_SESION_ADMIN_ORIGEN,
  OPCIONES_COOKIE_SESION,
} from "@/modules/auth/infrastructure/auth/SesionDelegada";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { respuestaError } from "@/app/api/_lib/http";

function respuestaCerrarSesiones(mensaje: string): NextResponse {
  const respuesta = respuestaError(mensaje, 401);
  respuesta.cookies.set(NOMBRE_COOKIE_SESION, "", { ...OPCIONES_COOKIE_SESION, maxAge: 0 });
  respuesta.cookies.set(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN, "", {
    ...OPCIONES_COOKIE_SESION,
    maxAge: 0,
  });
  return respuesta;
}

// Restaura el JWT administrativo original únicamente si aún es válido. Así un cambio de contraseña
// o una invalidación de sesión durante la delegación nunca revive una sesión que ya fue revocada.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const tokenAdministrador = cookieStore.get(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN)?.value;

  if (!tokenAdministrador) {
    return respuestaError("No hay una sesión de administrador para restaurar.", 409);
  }

  const sesionAdministrador = await verificarSesion(tokenAdministrador);

  if (!sesionAdministrador || !esPerfilAdministrador(sesionAdministrador.perfil)) {
    return respuestaCerrarSesiones("Tu sesión de administrador ya no es válida. Inicia sesión nuevamente.");
  }

  const tokenDelegado = cookieStore.get(NOMBRE_COOKIE_SESION)?.value;
  const sesionDelegada = tokenDelegado ? await verificarSesion(tokenDelegado) : null;

  auditarUsuario(sesionAdministrador, request, {
    accion: "SESION_DELEGADA_RESTAURADA",
    resultado: "EXITO",
    usuarioObjetivoId: sesionDelegada?.sub ?? null,
  });

  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(NOMBRE_COOKIE_SESION, tokenAdministrador, OPCIONES_COOKIE_SESION);
  respuesta.cookies.set(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN, "", {
    ...OPCIONES_COOKIE_SESION,
    maxAge: 0,
  });
  return respuesta;
}
