import { logger } from "@/infrastructure/logging/logger";
import { marcarProcesamientosHuerfanosComoFallidos } from "@/modules/bioestadistica/application/use-cases/MarcarProcesamientosHuerfanosComoFallidos";
import { almacenArchivosBioestadistica } from "@/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { prismaCargaBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository";

// RF-37: composición de las tareas de arranque del módulo (lo invoca `src/instrumentation.ts`). Nunca
// lanza: una base caída o un disco con problemas al arrancar no debe impedir que el servidor atienda;
// queda registrado en errores.txt y, como respaldo, las lecturas tratan un PROCESANDO de más de 2 horas
// como expirado. Las dos limpiezas son independientes: que falle una no impide la otra.
export async function liberarProcesamientosBioestadisticaHuerfanos(arranque: Date): Promise<void> {
  await Promise.all([liberarCargasHuerfanas(arranque), eliminarTemporalesHuerfanos(arranque)]);
}

async function liberarCargasHuerfanas(arranque: Date): Promise<void> {
  try {
    await marcarProcesamientosHuerfanosComoFallidos(arranque, {
      repositorio: prismaCargaBioestadisticaRepository,
      almacen: almacenArchivosBioestadistica,
    });
  } catch (error) {
    logger.error("Error al liberar los procesamientos huérfanos de Bioestadística al arrancar", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Temporales `.part` de recepciones que el proceso anterior no terminó (p. ej. se detuvo mientras se
// recibía un archivo): nadie más los elimina. El almacén ya registra cada fallo sin lanzar; el
// `try` es una defensa adicional.
async function eliminarTemporalesHuerfanos(arranque: Date): Promise<void> {
  try {
    await almacenArchivosBioestadistica.eliminarTemporalesAnterioresA(arranque);
  } catch (error) {
    logger.error("Error al eliminar los temporales de Bioestadística al arrancar", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
