import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarUsuarios } from "@/modules/usuarios/application/use-cases/ListarUsuarios";
import { crearUsuario } from "@/modules/usuarios/application/use-cases/CrearUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { hasheadorContrasenaBcrypt } from "@/modules/usuarios/infrastructure/auth/HasheadorContrasenaBcrypt";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { listadoUsuariosSchema } from "@/modules/usuarios/schemas/listado-usuarios.schema";
import { crearUsuarioSchema } from "@/modules/usuarios/schemas/usuario.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aUsuarioDTO,
  exigirAdmin,
  respuestaDuplicado,
  respuestaError,
  respuestaFormatoExcelInvalido,
  respuestaPerfilInvalido,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

// Las lecturas no se auditan: llenarían el archivo sin aportar trazabilidad de cambios.
export async function GET(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const parametros = Object.fromEntries(new URL(request.url).searchParams);
  const filtro = listadoUsuariosSchema.safeParse(parametros);

  if (!filtro.success) {
    return respuestaError(filtro.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await listarUsuarios(filtro.data, {
      repositorio: prismaUsuarioRepository,
    });

    return NextResponse.json({
      datos: resultado.filas.map(aUsuarioDTO),
      paginacion: resultado.paginacion,
    });
  } catch (error) {
    logger.error("Error al listar usuarios", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

export async function POST(request: Request) {
  const acceso = await exigirAdmin();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion: "USUARIO_CREADO",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  // El username no se recibe: se deriva del RUT en el servidor. Si el cliente lo envía,
  // el esquema lo descarta.
  const datos = crearUsuarioSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await crearUsuario(datos.data, {
      repositorio: prismaUsuarioRepository,
      repositorioPerfiles: prismaPerfilRepository,
      repositorioFormatosExcel: prismaFormatoExcelRepository,
      hasheadorContrasena: hasheadorContrasenaBcrypt,
    });

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
        accion: "USUARIO_CREADO",
        resultado: "RECHAZADO",
        motivo: "DUPLICADO",
        usuarioObjetivoRut: resultado.rut,
      });

      return respuestaDuplicado(resultado.campo);
    }

    auditarUsuario(acceso.sesion, request, {
      accion: "USUARIO_CREADO",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.usuario.id,
      usuarioObjetivoRut: resultado.usuario.rut,
    });

    return NextResponse.json({ usuario: aUsuarioDTO(resultado.usuario) }, { status: 201 });
  } catch (error) {
    logger.error("Error al crear usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
