import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarEstadoUsuario } from "@/modules/usuarios/application/use-cases/CambiarEstadoUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { cambiarEstadoSchema } from "@/modules/usuarios/schemas/usuario.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aUsuarioDTO,
  exigirAdmin,
  idUsuarioSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

const MENSAJES_CONFLICTO = {
  AUTO_OPERACION: "No puedes desactivar tu propia cuenta",
  ULTIMO_ADMIN: "No puedes desactivar al último administrador activo",
} as const;

export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  // Independientes entre sí: se resuelven en paralelo para no encadenar latencias.
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  // La acción auditada depende del estado solicitado, por eso el cuerpo se analiza antes
  // incluso de resolver el acceso: un 403 también queda registrado con su acción real.
  const datos = cambiarEstadoSchema.safeParse(cuerpo);
  const accion = datos.success && datos.data.activo ? "USUARIO_ACTIVADO" : "USUARIO_DESACTIVADO";

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion,
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

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarEstadoUsuario(
      idValido.data,
      datos.data.activo,
      acceso.sesion.sub,
      { repositorio: prismaUsuarioRepository },
    );

    if (!resultado.ok) {
      auditarUsuario(acceso.sesion, request, {
        accion,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        usuarioObjetivoId: idValido.data,
        usuarioObjetivoRut: "rut" in resultado ? resultado.rut : null,
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      return respuestaError(MENSAJES_CONFLICTO[resultado.motivo], 409, {
        codigo: resultado.motivo,
      });
    }

    auditarUsuario(acceso.sesion, request, {
      accion,
      resultado: "EXITO",
      usuarioObjetivoId: resultado.usuario.id,
      usuarioObjetivoRut: resultado.usuario.rut,
    });

    return NextResponse.json({ usuario: aUsuarioDTO(resultado.usuario) });
  } catch (error) {
    logger.error("Error al cambiar el estado de un usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
