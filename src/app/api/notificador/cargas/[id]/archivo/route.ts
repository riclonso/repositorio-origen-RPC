import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirNotificador,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

// El nombre de archivo viaja entre comillas dobles en `Content-Disposition`: se reemplazan por
// comillas simples, mismo criterio que la descarga de `dashboard/cargas/[id]/archivo`.
function nombreParaDescarga(nombreArchivo: string): string {
  return nombreArchivo.replace(/"/g, "'");
}

// Descarga del propio archivo desde "Mis cargas" (aprobada, pendiente de decisión o rechazada):
// a diferencia de la descarga de `dashboard`, sin restricción de `estado`, pero con ownership
// (`usuarioId = sesión.sub`) siempre en el `WHERE` — una carga que no es del actor responde 404.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const archivo = await prismaCargaArchivoRepository.obtenerPropiaParaDescarga(idValido.data, acceso.sesion.sub);

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
    logger.error("Error al descargar el binario de una carga de archivo propia", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
