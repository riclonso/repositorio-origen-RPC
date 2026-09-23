import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarSolicitudesReemplazoParaRevision } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoParaRevision";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { listadoSolicitudesReemplazoSchema } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aSolicitudReemplazoRevisionDTO,
  exigirAdminORevisor,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/solicitudes-reemplazo/_lib/http";

// Listado para revisión, usado por `/dashboard/solicitudes` (ADMIN) y `/revisor/solicitudes`
// (REVISOR_REPOSITORIO), mismo patrón que `/api/dashboard/cargas`. Lectura, no se audita.
export async function GET(request: Request) {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const { searchParams } = new URL(request.url);
  const filtro = listadoSolicitudesReemplazoSchema.safeParse(Object.fromEntries(searchParams));

  if (!filtro.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await listarSolicitudesReemplazoParaRevision(
      { estado: filtro.data.estado, pagina: filtro.data.page, tamano: filtro.data.pageSize },
      { repositorio: prismaSolicitudReemplazoCargaRepository },
    );

    const ahora = new Date();

    return NextResponse.json({
      datos: resultado.filas.map((solicitud) => aSolicitudReemplazoRevisionDTO(solicitud, ahora)),
      paginacion: resultado.paginacion,
    });
  } catch (error) {
    logger.error("Error al listar las solicitudes de reemplazo para revisión", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
