import path from "node:path";
import { createLogger, format, transports, type Logger } from "winston";
import { logger } from "@/infrastructure/logging/logger";

// Usado por `POST /api/notificador/cargas` (RF-14) para registrar cada intento de subida de un
// reporte, exitoso o fallido.
//
// A diferencia de `errores.txt`/`auditoria.txt` (rotación a cargo del sistema operativo), este
// transporte usa la rotación NATIVA de Winston: mantiene siempre el archivo activo como
// `upload.txt` y desplaza los archivados como `upload1.txt`, `upload2.txt`, etc. (nombre nativo
// de Winston, sin punto antes del número).
function crearLoggerUpload(): Logger {
  return createLogger({
    level: "info",
    format: format.combine(format.timestamp(), format.json()),
    transports: [
      new transports.File({
        filename: path.join(process.cwd(), "logs", "upload.txt"),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
        tailable: true,
      }),
    ],
  });
}

const loggerUpload = crearLoggerUpload();

export type EventoUpload = {
  evento: "subida_exitosa" | "subida_fallida";
  usuarioId: string;
  formatoExcelId: string;
  // Solo en subidas fallidas. Nunca el contenido del archivo ni ningún otro dato sensible.
  motivo?: string;
  ip: string | null;
};

// Fire-and-forget con su propio try/catch: un fallo al escribir este log jamás puede tumbar la
// petición que lo invoque. Mismo patrón que `registrarAuditoria()`.
export function registrarIntentoSubida(evento: EventoUpload): void {
  try {
    loggerUpload.info("upload", evento);
  } catch (error) {
    logger.error("Error al registrar un intento de subida de archivo", {
      evento: evento.evento,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
