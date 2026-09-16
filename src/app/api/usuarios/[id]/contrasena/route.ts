import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { restablecerContrasena } from "@/modules/usuarios/application/use-cases/RestablecerContrasena";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { hasheadorContrasenaBcrypt } from "@/modules/usuarios/infrastructure/auth/HasheadorContrasenaBcrypt";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { restablecerContrasenaSchema } from "@/modules/usuarios/schemas/usuario.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdmin,
  idUsuarioSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

// Fijado MANUAL de la contraseña por el administrador. Es la segunda opción del mantenedor, junto
// al envío de enlace (`POST .../enlace-contrasena`): aquí el admin escribe la contraseña y se fija
// directamente. Escribir el hash invalida los enlaces vigentes de la cuenta (ver
// `PrismaUsuarioRepository.actualizarContrasena`) y activa una cuenta pendiente.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  // Independientes entre sí: se resuelven en paralelo para no encadenar latencias.
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion: "CONTRASENA_RESTABLECIDA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        usuarioObjetivoId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idUsuarioSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = restablecerContrasenaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await restablecerContrasena(idValido.data, datos.data.contrasena, {
      repositorio: prismaUsuarioRepository,
      hasheadorContrasena: hasheadorContrasenaBcrypt,
    });

    if (!resultado.ok) {
      auditarUsuario(acceso.sesion, request, {
        accion: "CONTRASENA_RESTABLECIDA",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        usuarioObjetivoId: idValido.data,
      });

      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    // Solo queda registrado quién fijó la contraseña de quién y cuándo, nunca la contraseña.
    auditarUsuario(acceso.sesion, request, {
      accion: "CONTRASENA_RESTABLECIDA",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.id,
      usuarioObjetivoRut: resultado.rut,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error al fijar manualmente la contraseña de un usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
