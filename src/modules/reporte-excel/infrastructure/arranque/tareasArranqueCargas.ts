import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import { marcarProcesamientosCargaInterrumpidos } from "@/modules/reporte-excel/application/use-cases/MarcarProcesamientosCargaInterrumpidos";
import { almacenArchivosCargas } from "@/modules/reporte-excel/infrastructure/almacenamiento/almacenArchivosCargas";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";

// RF-38: tareas de arranque de las cargas del notificador (las invoca `src/instrumentation.ts`, junto a
// las de Bioestadística). Nunca lanza: una base caída o un disco con problemas al arrancar no debe
// impedir que el servidor atienda; queda en errores.txt (solo nombre y código del error: los de `fs`
// llevan rutas) y, como respaldo, la recepción libera un PROCESANDO de más de 2 horas. Las dos tareas
// son independientes.
export async function ejecutarTareasArranqueCargas(arranque: Date): Promise<void> {
  await Promise.all([liberarProcesamientosHuerfanos(arranque), eliminarTemporalesHuerfanos(arranque)]);
}

async function liberarProcesamientosHuerfanos(arranque: Date): Promise<void> {
  try {
    await marcarProcesamientosCargaInterrumpidos(arranque, { repositorio: prismaCargaArchivoRepository });
  } catch (error) {
    logger.error("Error al liberar las validaciones de cargas interrumpidas al arrancar", detalleErrorSeguro(error));
  }
}

async function eliminarTemporalesHuerfanos(arranque: Date): Promise<void> {
  try {
    await almacenArchivosCargas.eliminarTemporalesAnterioresA(arranque);
  } catch (error) {
    logger.error("Error al eliminar los temporales de cargas al arrancar", detalleErrorSeguro(error));
  }
}
