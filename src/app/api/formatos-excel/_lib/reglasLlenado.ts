import { randomUUID } from "node:crypto";
import { respuestaDescarga } from "@/app/api/_lib/descarga";
import { logger } from "@/infrastructure/logging/logger";
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";
import type { ArchivoReglasLlenado } from "@/modules/formatos-excel/application/use-cases/ObtenerReglasLlenadoParaNotificador";
import type { RegistrarFalloNoFatal } from "@/modules/formatos-excel/application/ports";
import { prismaReglasLlenadoRepository } from "@/modules/formatos-excel/infrastructure/repositories/PrismaReglasLlenadoRepository";
import { almacenReglasLlenado } from "@/modules/formatos-excel/infrastructure/almacenamiento/almacenReglasLlenado";
import { crearDetectorTipoDocumento } from "@/modules/formatos-excel/infrastructure/deteccion/DetectorTipoDocumento";
import { tipoContenidoReglasLlenado } from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";

// RF-45: composición de dependencias y respuesta de descarga, compartidas por la ruta administrativa
// (`/api/formatos-excel/[id]/reglas-llenado`) y la del notificador
// (`/api/notificador/ventanas-carga/[id]/reglas-llenado`).

// Los errores de `fs` llevan rutas en el mensaje: a errores.txt solo nombre y código.
export const registrarFalloReglas: RegistrarFalloNoFatal = (contexto, error) => {
  logger.error(contexto, detalleErrorSeguro(error));
};

export const dependenciasLecturaReglas = {
  repositorio: prismaReglasLlenadoRepository,
  almacen: almacenReglasLlenado,
};

export const dependenciasEscrituraReglas = {
  ...dependenciasLecturaReglas,
  detector: crearDetectorTipoDocumento(almacenReglasLlenado),
  generarId: randomUUID,
  registrarFallo: registrarFalloReglas,
};

// Siempre `attachment`, `nosniff` y sin caché compartida. El tipo de contenido sale de la extensión
// validada al subir (nunca de lo que declaró el cliente).
export function respuestaDescargaReglas({ reglas, archivo }: ArchivoReglasLlenado): Response {
  const respuesta = respuestaDescarga({
    flujo: archivo.flujo,
    tipoContenido: tipoContenidoReglasLlenado(reglas.extension),
    nombreArchivo: reglas.nombreArchivoOriginal,
    tamanoBytes: archivo.tamanoBytes,
  });
  respuesta.headers.set("Cache-Control", "private, no-store");
  return respuesta;
}

// `null` si falta la cabecera (`Number(null)` sería 0) o no es un entero no negativo.
export function tamanoDeclarado(request: Request): number | null {
  const cabecera = request.headers.get("content-length");
  if (cabecera === null || cabecera.trim() === "") return null;

  const valor = Number(cabecera);
  return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
}
