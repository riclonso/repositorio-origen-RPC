import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarCargasAprobadas } from "@/modules/reporte-excel/application/use-cases/ListarCargasAprobadas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { listadoCargasSchema } from "@/modules/reporte-excel/schemas/reporte-excel.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aCargaArchivoResumenDTO,
  exigirAdminORevisor,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

// Solo lectura, para ADMIN y REVISOR_REPOSITORIO. El filtro `estado = APROBADA` lo aplica el
// repositorio a nivel de consulta SQL, nunca aquí. No se audita: es una lectura.
export async function GET(request: Request) {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const { searchParams } = new URL(request.url);
  const filtro = listadoCargasSchema.safeParse(Object.fromEntries(searchParams));

  if (!filtro.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await listarCargasAprobadas(
      { formatoExcelId: filtro.data.formatoExcelId, pagina: filtro.data.page, tamano: filtro.data.pageSize },
      { repositorio: prismaCargaArchivoRepository },
    );

    return NextResponse.json({
      datos: resultado.filas.map(aCargaArchivoResumenDTO),
      paginacion: resultado.paginacion,
    });
  } catch (error) {
    logger.error("Error al listar las cargas de archivo aprobadas", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
