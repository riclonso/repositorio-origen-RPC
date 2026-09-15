import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { cambiarEstadoFormatoExcel } from "@/modules/formatos-excel/application/use-cases/CambiarEstadoFormatoExcel";
import { prismaFormatoExcelRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository";
import { auditarFormatoExcel } from "@/modules/formatos-excel/infrastructure/auditoria/auditarFormatoExcel";
import { cambiarEstadoFormatoExcelSchema } from "@/modules/formatos-excel/schemas/formato-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aFormatoExcelDTO,
  exigirAdmin,
  idFormatoExcelSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";

const ACCION = "FORMATO_EXCEL_ESTADO_CAMBIADO" as const;

// No bloquea si el formato tiene usuarios asignados (mismo criterio que `Perfil.activo`): los
// usuarios que ya lo tienen lo conservan, solo deja de poder asignarse a usuarios nuevos.
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdmin(),
    request.json().catch(() => null),
  ]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: ACCION,
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

  const datos = cambiarEstadoFormatoExcelSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await cambiarEstadoFormatoExcel(idValido.data, datos.data.activo, {
      repositorio: prismaFormatoExcelRepository,
    });

    if (!resultado.ok) {
      auditarFormatoExcel(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: "NO_ENCONTRADO",
        formatoExcelId: idValido.data,
      });
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarFormatoExcel(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      formatoExcelId: resultado.formato.id,
      formatoExcelNombre: resultado.formato.nombre,
    });

    return NextResponse.json({ formato: aFormatoExcelDTO(resultado.formato) });
  } catch (error) {
    logger.error("Error al cambiar el estado de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
