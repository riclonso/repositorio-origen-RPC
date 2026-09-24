import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteCookie } from "cookies-next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarContrasenaPropia } from "@/modules/usuarios/application/use-cases/CambiarContrasenaPropia";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { verificadorContrasenaBcrypt } from "@/modules/usuarios/infrastructure/auth/VerificadorContrasenaBcrypt";
import { hasheadorContrasenaBcrypt } from "@/modules/usuarios/infrastructure/auth/HasheadorContrasenaBcrypt";
import { cambiarContrasenaPropiaSchema } from "@/modules/usuarios/schemas/cambiar-contrasena-propia.schema";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirSesion,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/cuenta/_lib/http";

const MENSAJE_CONTRASENA_IGUAL = "La nueva contraseña debe ser distinta de la actual.";

// Autoservicio de cambio de contraseña (RF nuevo): la propia persona con sesión cambia su
// contraseña desde "Mi perfil"/"Cambiar contraseña". A diferencia de
// `PUT /api/usuarios/[id]/contrasena` (un ADMIN/REVISOR_REPOSITORIO fija la contraseña de un
// tercero), aquí el `id` SIEMPRE es `sesion.sub`, nunca un valor de la URL ni del cuerpo: por
// construcción `actorId === usuarioObjetivoId` en toda auditoría de este endpoint.
export async function PUT(request: Request) {
  const [acceso, cuerpo] = await Promise.all([exigirSesion(), request.json().catch(() => null)]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const datos = cambiarContrasenaPropiaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  const { sesion } = acceso;

  try {
    const resultado = await cambiarContrasenaPropia(
      sesion.sub,
      datos.data.contrasenaActual,
      datos.data.contrasenaNueva,
      {
        repositorio: prismaUsuarioRepository,
        verificadorContrasena: verificadorContrasenaBcrypt,
        hasheadorContrasena: hasheadorContrasenaBcrypt,
      },
    );

    if (!resultado.ok) {
      // `actorId === usuarioObjetivoId` siempre, por construcción: `cambiarContrasenaPropia`
      // recibe `sesion.sub` como único id posible, nunca uno de la URL o del cuerpo.
      auditarUsuario(sesion, request, {
        accion: "CONTRASENA_PROPIA_ACTUALIZADA",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        usuarioObjetivoId: sesion.sub,
      });

      if (resultado.motivo === "CONTRASENA_IGUAL_A_ACTUAL") {
        return respuestaError(MENSAJE_CONTRASENA_IGUAL, 400, { codigo: "CONTRASENA_IGUAL_A_ACTUAL" });
      }

      return respuestaError("La contraseña actual no es correcta", 400, {
        codigo: "CONTRASENA_ACTUAL_INCORRECTA",
      });
    }

    auditarUsuario(sesion, request, {
      accion: "CONTRASENA_PROPIA_ACTUALIZADA",
      resultado: "EXITO",
      usuarioObjetivoId: sesion.sub,
    });

    // El hash cambió: `sesionVersion` se incrementó en la misma transacción
    // (`PrismaUsuarioRepository.actualizarContrasena`), así que el JWT vigente ya quedó inválido
    // en el servidor. Borrar la cookie evita además que el navegador siga enviando un token que
    // `verificarSesion()` de todas formas rechazaría.
    await deleteCookie("sesion", { cookies, path: "/" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error al cambiar la contraseña propia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
