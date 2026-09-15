import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { actualizarUsuario } from "@/modules/usuarios/application/use-cases/ActualizarUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { editarUsuarioSchema } from "@/modules/usuarios/schemas/usuario.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aUsuarioDTO,
  exigirAdmin,
  idUsuarioSchema,
  respuestaDuplicado,
  respuestaError,
  respuestaFormatoExcelInvalido,
  respuestaPerfilInvalido,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

const MENSAJES_CONFLICTO = {
  AUTO_OPERACION: "No puedes quitarte a ti mismo el perfil de administrador",
  ULTIMO_ADMIN: "No puedes quitar el perfil al último administrador activo",
} as const;

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
        accion: "USUARIO_ACTUALIZADO",
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

  // El RUT y el username se ignoran aunque vengan en el cuerpo: no son editables.
  const datos = editarUsuarioSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await actualizarUsuario(
      idValido.data,
      datos.data,
      acceso.sesion.sub,
      {
        repositorio: prismaUsuarioRepository,
        repositorioPerfiles: prismaPerfilRepository,
        repositorioFormatosExcel: prismaFormatoExcelRepository,
      },
    );

    if (!resultado.ok) {
      // Un perfil o un formato inválidos son errores de validación: no se auditan, como el
      // resto de los 400.
      if (resultado.motivo === "PERFIL_INVALIDO") {
        return respuestaPerfilInvalido();
      }

      if (resultado.motivo === "FORMATO_INVALIDO") {
        return respuestaFormatoExcelInvalido();
      }

      auditarUsuario(acceso.sesion, request, {
        accion: "USUARIO_ACTUALIZADO",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        usuarioObjetivoId: idValido.data,
        usuarioObjetivoRut: "rut" in resultado ? resultado.rut : null,
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      if (resultado.motivo === "DUPLICADO") {
        return respuestaDuplicado(resultado.campo);
      }

      return respuestaError(MENSAJES_CONFLICTO[resultado.motivo], 409, {
        codigo: resultado.motivo,
      });
    }

    auditarUsuario(acceso.sesion, request, {
      accion: "USUARIO_ACTUALIZADO",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.usuario.id,
      usuarioObjetivoRut: resultado.usuario.rut,
      campos: resultado.camposModificados,
      perfilAnterior: resultado.perfilAnterior,
      perfilNuevo: resultado.perfilNuevo,
      formatosAgregados: resultado.formatosAgregados,
      formatosQuitados: resultado.formatosQuitados,
    });

    return NextResponse.json({ usuario: aUsuarioDTO(resultado.usuario) });
  } catch (error) {
    logger.error("Error al actualizar usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
