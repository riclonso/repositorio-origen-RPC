import { logger } from "@/infrastructure/logging/logger";
import { obtenerArchivoCargaBioestadistica } from "@/modules/bioestadistica/application/use-cases/ObtenerArchivoCargaBioestadistica";
import { almacenArchivosBioestadistica } from "@/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import { exigirAdminORevisor } from "@/app/api/_lib/http";
import {
  MENSAJE_ERROR_INTERNO,
  idRutaSchema,
  respuestaDescargaArchivo,
  respuestaError,
  respuestaNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/bioestadistica/_lib/http";

// RF-37: descarga administrativa (ADMIN y REVISOR_REPOSITORIO) en streaming del archivo original de
// una carga de Bioestadística vigente o reemplazada. Lectura: no se audita.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);
  if (!idValido.success) return respuestaNoEncontrado();

  try {
    const archivo = await obtenerArchivoCargaBioestadistica(
      { cargaId: idValido.data, usuarioId: null },
      { repositorio: prismaCargaBioestadisticaRepository, almacen: almacenArchivosBioestadistica },
    );

    return archivo ? respuestaDescargaArchivo(archivo) : respuestaNoEncontrado();
  } catch (error) {
    logger.error("Error al descargar un archivo de Bioestadística (administración)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
