import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logger } from "@/infrastructure/logging/logger";
import { jwtService } from "@/modules/auth/infrastructure/auth/JwtService";
import {
  NOMBRE_COOKIE_SESION,
  NOMBRE_COOKIE_SESION_ADMIN_ORIGEN,
  OPCIONES_COOKIE_SESION,
} from "@/modules/auth/infrastructure/auth/SesionDelegada";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { puedeIniciarSesion } from "@/modules/auth/domain/entities/User";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import {
  exigirAdmin,
  idUsuarioSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

const MENSAJE_CUENTA_NO_DISPONIBLE = "La cuenta seleccionada no está disponible para iniciar una sesión.";

// El administrador inicia una sesión delegada sin conocer ni alterar la contraseña de la persona.
// La cookie `sesion-admin-origen` guarda su JWT vigente de forma HTTP-only para que el único camino
// de retorno sea validarlo nuevamente en el servidor.
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cookieStore] = await Promise.all([contexto.params, exigirAdmin(), cookies()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion: "SESION_DELEGADA_INICIADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        usuarioObjetivoId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idUsuarioSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError("Usuario no encontrado", 404, { codigo: "NO_ENCONTRADO" });
  }

  // No se admiten delegaciones anidadas: impedirlas evita perder la referencia a la sesión del
  // administrador que comenzó la operación y mantiene un único retorno inequívoco.
  if (cookieStore.has(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN)) {
    auditarUsuario(acceso.sesion, request, {
      accion: "SESION_DELEGADA_INICIADA",
      resultado: "RECHAZADO",
      motivo: "SESION_DELEGADA_ACTIVA",
      usuarioObjetivoId: idValido.data,
    });

    return respuestaError("Primero debes volver a tu sesión de administrador.", 409);
  }

  if (idValido.data === acceso.sesion.sub) {
    auditarUsuario(acceso.sesion, request, {
      accion: "SESION_DELEGADA_INICIADA",
      resultado: "RECHAZADO",
      motivo: "AUTO_OPERACION",
      usuarioObjetivoId: idValido.data,
    });

    return respuestaError("Ya estás usando tu propia sesión.", 409);
  }

  try {
    const usuarioObjetivo = await prismaUserRepository.buscarPorId(idValido.data);

    if (!usuarioObjetivo) {
      auditarUsuario(acceso.sesion, request, {
        accion: "SESION_DELEGADA_INICIADA",
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        usuarioObjetivoId: idValido.data,
      });

      return respuestaError("Usuario no encontrado", 404, { codigo: "NO_ENCONTRADO" });
    }

    // Se respeta la misma puerta de acceso que el login: no es posible delegar hacia cuentas
    // inactivas o pendientes de contraseña, aunque quien hace la operación sea administrador.
    if (!puedeIniciarSesion(usuarioObjetivo)) {
      auditarUsuario(acceso.sesion, request, {
        accion: "SESION_DELEGADA_INICIADA",
        resultado: "RECHAZADO",
        motivo: "CUENTA_INACTIVA",
        usuarioObjetivoId: usuarioObjetivo.id,
        usuarioObjetivoRut: usuarioObjetivo.rut,
      });

      return respuestaError(MENSAJE_CUENTA_NO_DISPONIBLE, 409);
    }

    const tokenObjetivo = await jwtService.emitir(usuarioObjetivo);
    const tokenAdministrador = cookieStore.get(NOMBRE_COOKIE_SESION)?.value;

    // `exigirAdmin` ya verificó esta sesión; este guard adicional solo protege contra una petición
    // anómala donde la cookie se hubiera ausentado durante la construcción de la respuesta.
    if (!tokenAdministrador) {
      return respuestaSinAcceso(401);
    }

    auditarUsuario(acceso.sesion, request, {
      accion: "SESION_DELEGADA_INICIADA",
      resultado: "EXITO",
      usuarioObjetivoId: usuarioObjetivo.id,
      usuarioObjetivoRut: usuarioObjetivo.rut,
    });

    const respuesta = NextResponse.json({ ok: true });
    respuesta.cookies.set(NOMBRE_COOKIE_SESION, tokenObjetivo, OPCIONES_COOKIE_SESION);
    respuesta.cookies.set(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN, tokenAdministrador, OPCIONES_COOKIE_SESION);
    return respuesta;
  } catch (error) {
    logger.error("Error al iniciar una sesión delegada", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError("No se pudo iniciar la sesión del usuario. Intenta nuevamente.", 500);
  }
}
