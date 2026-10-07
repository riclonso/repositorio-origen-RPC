import { logger } from "@/infrastructure/logging/logger";
import { obtenerArchivoCargaBioestadistica } from "@/modules/bioestadistica/application/use-cases/ObtenerArchivoCargaBioestadistica";
import { almacenArchivosBioestadistica } from "@/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";
import {
  MENSAJE_ERROR_INTERNO,
  exigirBioestadistica,
  idRutaSchema,
  respuestaDescargaArchivo,
  respuestaError,
  respuestaNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/bioestadistica/_lib/http";

// RF-37: descarga en streaming del archivo PROPIO (vigente o reemplazado) desde "Mis archivos".
// Ownership en el `WHERE`: un archivo ajeno responde el mismo 404 que uno inexistente. Lectura: no
// se audita.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirBioestadistica()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);
  if (!idValido.success) return respuestaNoEncontrado();

  try {
    const archivo = await obtenerArchivoCargaBioestadistica(
      { cargaId: idValido.data, usuarioId: acceso.sesion.sub },
      { repositorio: prismaCargaBioestadisticaRepository, almacen: almacenArchivosBioestadistica },
    );

    return archivo ? respuestaDescargaArchivo(archivo) : respuestaNoEncontrado();
  } catch (error) {
    logger.error("Error al descargar un archivo propio de Bioestadística", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
