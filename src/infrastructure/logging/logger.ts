import path from "node:path";
import { createLogger, format, transports, type Logger } from "winston";

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

export const logger = crearLoggerArchivo("errores.txt", "error");

export const loggerAuditoria = crearLoggerArchivo("auditoria.txt", "info");

// RF-07: rastro de todo intento de inicio de sesión, exitoso y fallido. Nivel `info`, mismo
// criterio que `loggerAuditoria`: no son errores del sistema.
export const loggerAccesos = crearLoggerArchivo("accesos.txt", "info");
