import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerCargaAprobada } from "@/modules/reporte-excel/application/use-cases/ObtenerCargaAprobada";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  aCargaArchivoDTO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

// Detalle de una carga aprobada. 404 si no existe o si todavía no fue aprobada: para ADMIN y
// REVISOR_REPOSITORIO, una carga sin visto bueno del notificador es indistinguible de inexistente.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const carga = await obtenerCargaAprobada(idValido.data, { repositorio: prismaCargaArchivoRepository });

    if (!carga) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return NextResponse.json({ carga: aCargaArchivoDTO(carga) });
  } catch (error) {
    logger.error("Error al obtener una carga de archivo aprobada", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
