import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { AlmacenArchivos } from "@/modules/bioestadistica/application/ports";

// RF-37: al arrancar el servidor (`src/instrumentation.ts`), todo PROCESANDO creado ANTES del
// arranque es huérfano: el proceso que lo procesaba ya no existe. Se marcan FALLIDA con
// PROCESAMIENTO_INTERRUMPIDO (filas borradas) y se eliminan sus archivos. Asume UNA sola instancia
// de la aplicación, mismo supuesto que el scheduler de alertas de RF-17. Devuelve cuántas se
// liberaron.
export async function marcarProcesamientosHuerfanosComoFallidos(
  arranque: Date,
  dependencias: { repositorio: CargaBioestadisticaRepository; almacen: AlmacenArchivos },
): Promise<number> {
  const huerfanas = await dependencias.repositorio.marcarProcesandoAnterioresComoFallidas(arranque);

  await Promise.all(
    huerfanas.flatMap((carga) => (carga.referenciaArchivo ? [dependencias.almacen.eliminar(carga.referenciaArchivo)] : [])),
  );

  return huerfanas.length;
}
