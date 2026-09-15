import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { leerColumnasPlantilla } from "@/modules/formatos-excel/application/use-cases/LeerColumnasPlantilla";
import { lectorPlantillaExcelJs } from "@/modules/formatos-excel/infrastructure/lectura-plantilla/LectorPlantillaExcelJs";
import {
  MENSAJE_ERROR_INTERNO,
  TAMANO_MAXIMO_PLANTILLA,
  exigirAdminORevisor,
  respuestaArchivoInvalido,
  respuestaError,
  respuestaSinAcceso,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
} from "@/app/api/formatos-excel/_lib/http";

// No persiste nada: solo lee la primera fila de la plantilla y devuelve las columnas detectadas,
// para que el asistente de creación las muestre antes de que quien lo crea (ADMIN o
// REVISOR_REPOSITORIO) decida cuáles son requeridas y su tipo de dato.
export async function POST(request: Request) {
  const acceso = await exigirAdminORevisor();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const formData = await request.formData().catch(() => null);
  const archivo = formData?.get("archivo");

  if (!(archivo instanceof File)) {
    return respuestaArchivoInvalido("Selecciona un archivo de plantilla");
  }

  // Primer filtro, barato: rechaza una extensión no soportada sin leer el archivo completo.
  if (!tipoContenidoDesdeNombre(archivo.name)) {
    return respuestaArchivoInvalido("El archivo debe tener extensión .xlsx o .csv");
  }

  // Se verifica el tamaño ANTES de leer el archivo completo en memoria y de intentar parsearlo.
  if (archivo.size > TAMANO_MAXIMO_PLANTILLA) {
    return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());

    if (buffer.byteLength > TAMANO_MAXIMO_PLANTILLA) {
      return respuestaArchivoInvalido("El archivo no puede superar los 10 MB");
    }

    // Validación de fondo: la firma real de los primeros bytes, no solo la extensión del
    // nombre (trivial de falsificar renombrando el archivo).
    const tipoContenido = tipoContenidoDesdeArchivo(archivo.name, buffer);

    if (!tipoContenido) {
      return respuestaArchivoInvalido("El contenido del archivo no corresponde a su extensión");
    }

    const resultado = await leerColumnasPlantilla(buffer, tipoContenido, {
      lectorPlantilla: lectorPlantillaExcelJs,
    });

    if (!resultado.ok) {
      const mensaje =
        resultado.motivo === "SIN_COLUMNAS"
          ? "La plantilla no tiene columnas en la primera fila"
          : `La plantilla tiene columnas repetidas: "${resultado.nombre}"`;

      return respuestaArchivoInvalido(mensaje);
    }

    return NextResponse.json({ columnas: resultado.columnas });
  } catch (error) {
    logger.error("Error al leer una plantilla de formato de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
