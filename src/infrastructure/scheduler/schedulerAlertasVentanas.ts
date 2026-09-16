import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { logger } from "@/infrastructure/logging/logger";
import { ejecutarEnvioAutomaticoAlertas } from "@/modules/ventanas-carga/application/use-cases/EjecutarEnvioAutomaticoAlertas";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { prismaAlertaNotificacionRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaAlertaNotificacionRepository";
import { alertaVentanaMailer } from "@/modules/ventanas-carga/infrastructure/email/AlertaVentanaMailer";

// Exactamente el patrón de `prisma.ts`/`SmtpMailer.ts`: UNA tarea programada por proceso, más una
// copia en `globalThis` solo en desarrollo, para sobrevivir al Fast Refresh sin registrar una
// segunda tarea cron cada vez que este módulo se vuelve a evaluar.
const globalParaScheduler = globalThis as unknown as { tareaAlertasVentanas?: ScheduledTask };

export function iniciarSchedulerAlertasVentanas(): void {
  if (globalParaScheduler.tareaAlertasVentanas) return;

  const tarea = cron.schedule(
    "0 8 * * *",
    () => {
      ejecutarEnvioAutomaticoAlertas({
        repositorioVentanas: prismaVentanaCargaRepository,
        repositorioAlertas: prismaAlertaNotificacionRepository,
        enviadorCorreo: alertaVentanaMailer,
      }).catch((error) => {
        // Solo un fallo del CICLO COMPLETO (no de un envío puntual, que ya queda registrado como
        // fila ERROR en `alerta_notificacion_ventana`) llega hasta aquí: algo como un error de
        // BD. Los envíos automáticos no se auditan en `logs/auditoria.txt` (la tabla ya es su
        // registro estructurado); esto es lo único que va a `logs/errores.txt`.
        logger.error("Error en el ciclo automático de alertas de ventanas de carga", {
          mensaje: error instanceof Error ? error.message : String(error),
        });
      });
    },
    { timezone: "America/Santiago" },
  );

  if (process.env.NODE_ENV !== "production") {
    globalParaScheduler.tareaAlertasVentanas = tarea;
  }
}
