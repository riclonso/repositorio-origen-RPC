import path from "node:path";
import { createLogger, format, transports, type Logger } from "winston";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";

// Instancias independientes con su propio transporte: así un evento de auditoría es
// físicamente incapaz de terminar escrito en errores.txt, y viceversa.
// La rotación de estos archivos queda a cargo del sistema operativo del servidor.
function crearLoggerArchivo(nombreArchivo: string, nivel: string): Logger {
  return createLogger({
    level: nivel,
    format: format.combine(format.timestamp(), format.json()),
    transports: [
      new transports.File({ filename: path.join(process.cwd(), "logs", nombreArchivo) }),
    ],
  });
}

const loggerErroresArchivo = crearLoggerArchivo("errores.txt", "error");

// No se espera esta escritura: registrar un error nunca debe ocultar ni reemplazar el error
// original. Winston conserva el respaldo local y PostgreSQL alimenta el panel persistente.
export const logger = {
  error(mensaje: string, campos?: Record<string, unknown>) {
    loggerErroresArchivo.error(mensaje, campos);
    void prisma.registroErrorSistema
      .create({ data: { mensaje, campos: campos as Prisma.InputJsonValue | undefined } })
      .catch(() => undefined);
  },
};

export const loggerAuditoria = crearLoggerArchivo("auditoria.txt", "info");

// RF-07: rastro de todo intento de inicio de sesión, exitoso y fallido. Nivel `info`, mismo
// criterio que `loggerAuditoria`: no son errores del sistema.
export const loggerAccesos = crearLoggerArchivo("accesos.txt", "info");
