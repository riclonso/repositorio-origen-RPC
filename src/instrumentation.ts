// Tareas de arranque, una vez, cuando el servidor de Next.js se inicializa. Filtrado por
// `NEXT_RUNTIME === "nodejs"`: `node-cron`, Prisma y `node:fs` son Node-only, y `register()` también
// se evalúa en el runtime Edge, donde este código no debe ejecutarse. Ver
// `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // RF-17: scheduler de alertas de ventanas de carga.
    const { iniciarSchedulerAlertasVentanas } = await import(
      "@/infrastructure/scheduler/schedulerAlertasVentanas"
    );
    iniciarSchedulerAlertasVentanas();

    // RF-37: los archivos de Bioestadística que quedaron PROCESANDO cuando el proceso anterior se
    // detuvo ya no tienen quién los termine. No se espera: `register()` debe terminar antes de que el
    // servidor atienda peticiones, y la limpieza puede borrar muchas filas. El corte por instante de
    // arranque impide tocar una subida que llegue mientras tanto. Con el mismo corte se eliminan los
    // temporales `.part` de recepciones que quedaron a medias.
    const { limpiarSubidasExpiradas } = await import("@/modules/subidas-archivo/infrastructure/arranque");
    void limpiarSubidasExpiradas();

    const arranque = new Date();
    const { liberarProcesamientosBioestadisticaHuerfanos } = await import(
      "@/modules/bioestadistica/infrastructure/arranque/liberarProcesamientosHuerfanos"
    );
    void liberarProcesamientosBioestadisticaHuerfanos(arranque);

    // RF-38: mismo criterio para las cargas del notificador (validaciones en PROCESANDO que el proceso
    // anterior no terminó y temporales de recepciones a medias).
    const { ejecutarTareasArranqueCargas } = await import(
      "@/modules/reporte-excel/infrastructure/arranque/tareasArranqueCargas"
    );
    void ejecutarTareasArranqueCargas(arranque);
  }
}
