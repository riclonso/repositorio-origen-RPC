// Arranca el scheduler de alertas de ventanas de carga (RF-17) una vez, cuando el servidor de
// Next.js se inicializa. Filtrado por `NEXT_RUNTIME === "nodejs"`: `node-cron` es Node-only (usa
// temporizadores de proceso), y `register()` también se evalúa en el runtime Edge, donde este
// código no debe ejecutarse. Ver
// `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarSchedulerAlertasVentanas } = await import(
      "@/infrastructure/scheduler/schedulerAlertasVentanas"
    );
    iniciarSchedulerAlertasVentanas();
  }
}
