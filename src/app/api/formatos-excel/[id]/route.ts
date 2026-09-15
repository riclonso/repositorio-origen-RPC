import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ObtenerFormatoExcel";
import { actualizarFormatoExcel } from "@/modules/formatos-excel/application/use-cases/ActualizarFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarFormatoExcel } from "@/modules/formatos-excel/infrastructure/auditoria/auditarFormatoExcel";
import { editarFormatoExcelSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aFormatoExcelDTO,
  exigirAdmin,
  idFormatoExcelSchema,
  respuestaDuplicado,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";

export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdmin()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const formato = await obtenerFormatoExcel(idValido.data, { repositorio: prismaFormatoExcelRepository });

    if (!formato) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ formato: aFormatoExcelDTO(formato) });
  } catch (error) {
    logger.error("Error al obtener un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// NO reemplaza la plantilla persistida (decisión ya tomada): solo actualiza `nombre`,
// `descripcion` y el set completo de columnas.
export async function PUT(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_ACTUALIZADO",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        formatoExcelId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idFormatoExcelSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  const datos = editarFormatoExcelSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await actualizarFormatoExcel(idValido.data, datos.data, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
      }

      auditarFormatoExcel(acceso.sesion, request, {
        accion: "FORMATO_EXCEL_ACTUALIZADO",
        resultado: "RECHAZADO",
        motivo: "DUPLICADO",
        formatoExcelId: idValido.data,
        formatoExcelNombre: resultado.nombre,
      });

      return respuestaDuplicado(resultado.nombre);
    }

    auditarFormatoExcel(acceso.sesion, request, {
      accion: "FORMATO_EXCEL_ACTUALIZADO",
      resultado: "EXITO",
      formatoExcelId: resultado.formato.id,
      formatoExcelNombre: resultado.formato.nombre,
    });

    return NextResponse.json({ formato: aFormatoExcelDTO(resultado.formato) });
  } catch (error) {
    logger.error("Error al actualizar un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
