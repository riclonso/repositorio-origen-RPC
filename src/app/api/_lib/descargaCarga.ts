import { logger } from "@/infrastructure/logging/logger";
import { ClaveOcupadaError, LimitadorOcupadoError } from "@/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";
import {
  obtenerArchivoCargaParaDescarga,
  type ModoDescargaCarga,
} from "@/modules/reporte-excel/application/use-cases/ObtenerArchivoCargaParaDescarga";
import { almacenArchivosCargas } from "@/modules/reporte-excel/infrastructure/almacenamiento/almacenArchivosCargas";
import { generadorDescargaCarga } from "@/modules/reporte-excel/infrastructure/composicion";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { respuestaDescarga } from "@/app/api/_lib/descarga";
import { respuestaError } from "@/app/api/_lib/http";

const MENSAJE_NO_ENCONTRADO = "La carga no existe";
const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
const SEGUNDOS_REINTENTO_OCUPADO = 60;

// RF-38: cuerpo común de las tres descargas de cargas del notificador (propia, administrativa y
// "original"). El guard y la validación del id los hace cada Route Handler ANTES de llamar aquí.
// 404 uniforme (no existe, no es del actor, estado no descargable o archivo ausente en disco; este
// último se registra en errores.txt). Descarga generada: 503 `OCUPADO` si no hubo turno en 30 s, y 409
// `DESCARGA_EN_CURSO` si la misma persona ya tiene otra generándose (es un conflicto con su propio
// estado, no falta de capacidad del servidor: reintentar de inmediato no sirve hasta que termine la
// primera). 500 genérico si falla antes de empezar a responder; un fallo a mitad del flujo lo corta
// y lo registra el generador. Lectura: no se audita. En los logs solo nombre y código del error, nunca
// el mensaje (los de `fs` llevan rutas).
export async function responderDescargaCarga(entrada: {
  cargaId: string;
  usuarioId: string | null;
  modo: ModoDescargaCarga;
  solicitanteId: string;
}): Promise<Response> {
  try {
    const resultado = await obtenerArchivoCargaParaDescarga(entrada, {
      repositorio: prismaCargaArchivoRepository,
      almacen: almacenArchivosCargas,
      generador: generadorDescargaCarga,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "ARCHIVO_AUSENTE") {
        logger.error("El archivo de una carga no está en disco", { cargaArchivoId: entrada.cargaId });
      }
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    const { archivo } = resultado;
    return respuestaDescarga({
      flujo: archivo.flujo,
      tipoContenido: archivo.tipoContenido,
      nombreArchivo: archivo.nombreArchivo,
      tamanoBytes: archivo.tamanoBytes,
    });
  } catch (error) {
    if (error instanceof LimitadorOcupadoError) {
      const respuesta = respuestaError("Hay muchas descargas en curso. Intenta en unos minutos.", 503, { codigo: "OCUPADO" });
      respuesta.headers.set("Retry-After", String(SEGUNDOS_REINTENTO_OCUPADO));
      return respuesta;
    }
    if (error instanceof ClaveOcupadaError) {
      return respuestaError(
        "Ya tienes una descarga en preparación. Espera a que termine para iniciar otra.",
        409,
        { codigo: "DESCARGA_EN_CURSO" },
      );
    }
    logger.error("Error al descargar el archivo de una carga", {
      cargaArchivoId: entrada.cargaId,
      error: error instanceof Error ? error.name : "desconocido",
      codigo: codigoError(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

function codigoError(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}
