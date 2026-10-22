import path from "node:path";
import { createLogger, format, transports, type Logger } from "winston";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import {
  ARCHIVO_FALLAS_CORREO,
  ARCHIVOS_MAXIMOS_FALLAS_CORREO,
  TAMANO_MAXIMO_FALLAS_CORREO,
} from "@/infrastructure/logging/catalogoFallasCorreo";

// Instancias independientes con su propio transporte: así un evento de auditoría es
// físicamente incapaz de terminar escrito en errores.txt, y viceversa.
// La rotación de estos archivos queda a cargo del sistema operativo del servidor (salvo
// `fallas-correo.txt`, que rota en su propio transporte; ver más abajo).
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

// RF-44: fallas de envío de correo de todo el sistema. Se escribe SOLO a través de
// `registrarFallaCorreo()` (`fallasCorreo.ts`), nunca directamente. A diferencia de los demás logs,
// este rota por tamaño en el propio transporte, porque cada entrada lleva el cuerpo del correo que
// se intentó enviar y un relay caído puede generar muchas en poco tiempo.
//
// `tailable: true`: el archivo activo es SIEMPRE `fallas-correo.txt`; al llenarse pasa a
// `fallas-correo1.txt`, el 1 al 2, y así hasta `fallas-correo4.txt` (el más antiguo, que se
// descarta en la rotación siguiente). Ver `_checkMaxFilesTailable` en winston 3.
export const loggerFallasCorreo: Logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.File({
      filename: path.join(process.cwd(), "logs", ARCHIVO_FALLAS_CORREO),
      maxsize: TAMANO_MAXIMO_FALLAS_CORREO,
      maxFiles: ARCHIVOS_MAXIMOS_FALLAS_CORREO,
      tailable: true,
    }),
  ],
});
