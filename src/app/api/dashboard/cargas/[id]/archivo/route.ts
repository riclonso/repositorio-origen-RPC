import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples para que un nombre de archivo manipulado no pueda cerrar el valor antes de
// tiempo. Mismo criterio que la descarga de plantillas de `formatos-excel`.
function nombreParaDescarga(nombreArchivo: string): string {
  return nombreArchivo.replace(/"/g, "'");
}

// Descarga el binario original para la revisión: solo si está aprobada o si el notificador ya la
// finalizó y envió (`PENDIENTE_VISTO_BUENO`). El repositorio impone ambas condiciones en SQL; los
// borradores y cargas con errores no son descargables. El `Content-Type` sale del valor
// persistido, nunca de lo que declaró el cliente al subir.
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
    const archivo = await prismaCargaArchivoRepository.obtenerParaDescarga(idValido.data);

    if (!archivo) {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    return new NextResponse(new Uint8Array(archivo.contenidoArchivo), {
      status: 200,
      headers: {
        "Content-Type": archivo.tipoContenidoArchivo,
        "Content-Disposition": `attachment; filename="${nombreParaDescarga(archivo.nombreArchivoOriginal)}"`,
      },
    });
  } catch (error) {
    logger.error("Error al descargar el binario de una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
