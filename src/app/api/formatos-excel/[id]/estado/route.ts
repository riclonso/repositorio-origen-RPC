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
  exigirAdminORevisor,
  idFormatoExcelSchema,
  respuestaConflictoConcurrente,
  respuestaError,
  respuestaFormatoUnicoDeNotificadores,
  respuestaSinAcceso,
} from "@/app/api/formatos-excel/_lib/http";

const ACCION = "FORMATO_EXCEL_ESTADO_CAMBIADO" as const;

// Desactivar QUITA el formato a todos los usuarios que lo tienen asignado, en la misma transacción.
// Se bloquea con 409 `FORMATO_UNICO_DE_NOTIFICADORES` si es el único formato de algún
// NOTIFICADOR_RPC (activo o inactivo). Desactivar un formato ya inactivo no toca sus asignaciones
// heredadas (`SIN_EFECTO`). Activar no restaura asignaciones.
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso, cuerpo] = await Promise.all([
    contexto.params,
    exigirAdminORevisor(),
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
      if (resultado.motivo === "FORMATO_UNICO_DE_NOTIFICADORES") {
        auditarFormatoExcel(acceso.sesion, request, {
          accion: ACCION,
          resultado: "RECHAZADO",
          motivo: "FORMATO_UNICO_DE_NOTIFICADORES",
          formatoExcelId: idValido.data,
          formatoExcelNombre: resultado.nombre,
          activo: datos.data.activo,
          usuariosBloqueantesIds: resultado.bloqueo.usuariosIds,
        });
        return respuestaFormatoUnicoDeNotificadores(resultado.bloqueo, "desactivar");
      }

      auditarFormatoExcel(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        formatoExcelId: idValido.data,
        activo: datos.data.activo,
      });

      return resultado.motivo === "CONFLICTO_CONCURRENTE"
        ? respuestaConflictoConcurrente()
        : respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    const cantidadAsignacionesEliminadas = resultado.asignacionesEliminadasUsuarioIds.length;

    auditarFormatoExcel(acceso.sesion, request, {
      accion: ACCION,
      resultado: resultado.cambio === "SIN_CAMBIO" ? "SIN_EFECTO" : "EXITO",
      formatoExcelId: resultado.formato.id,
      formatoExcelNombre: resultado.formato.nombre,
      activo: resultado.formato.activo,
      ...(resultado.cambio === "DESACTIVADO"
        ? {
            cantidadAsignacionesEliminadas,
            asignacionesEliminadasUsuarioIds: resultado.asignacionesEliminadasUsuarioIds,
          }
        : {}),
    });

    return NextResponse.json({ formato: aFormatoExcelDTO(resultado.formato), cantidadAsignacionesEliminadas });
  } catch (error) {
    logger.error("Error al cambiar el estado de un formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
