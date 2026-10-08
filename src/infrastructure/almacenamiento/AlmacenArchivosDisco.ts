import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { logger } from "@/infrastructure/logging/logger";
// Los errores de `fs` llevan rutas en el mensaje: en los logs, solo nombre y código.
import { detalleErrorSeguro } from "@/infrastructure/logging/detalleErrorSeguro";

// Almacén de binarios en disco, compartido por Bioestadística (RF-37) y las cargas del notificador
// (RF-38). Un archivo de cientos de MB NO se guarda en la base (`Bytes` de Prisma lo cargaría completo en
// memoria y lo codificaría en hexadecimal): vive en `<base>/<anio>/<cargaId>.<ext>`, y en la base
// solo su referencia relativa.
//
// Seguridad:
//  - Las referencias las genera SIEMPRE este módulo (uuid, año, extensión fija); el nombre que envió
//    el cliente nunca forma parte de una ruta.
//  - Toda referencia se resuelve con `path.resolve` y se verifica que quede bajo `<base>` (defensa
//    contra path traversal aunque una referencia de la base estuviera adulterada).
//  - Directorios 0700 y archivos 0600 (solo el usuario del proceso; en Windows lo ignora el SO).
//  - El directorio se crea en la primera escritura, nunca al importar el módulo.

const SUBDIRECTORIO_TEMPORAL = "tmp";
const EXTENSION_TEMPORAL = ".part";
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoGuardadoTemporalDisco =
  | { ok: true; referenciaTemporal: string; tamanoBytes: number; sha256: string; primerosBytes: Uint8Array }
  | { ok: false; motivo: "VACIO" | "EXCEDE_TAMANO" };

export type ArchivoAbiertoDisco = { flujo: ReadableStream<Uint8Array>; tamanoBytes: number };

export type ResultadoLimpiezaTemporales = { eliminados: number; fallidos: number };

// Satisface por tipado estructural los puertos `AlmacenArchivos` (Bioestadística) y
// `AlmacenArchivosCarga` (reporte-excel).
export type AlmacenArchivosDisco = {
  // Copia el flujo a un temporal contando bytes (corta al superar `limiteBytes`) y calculando el
  // SHA-256 mientras recibe. Ante cualquier corte, el temporal ya queda eliminado.
  guardarTemporal(origen: ReadableStream<Uint8Array>, limiteBytes: number): Promise<ResultadoGuardadoTemporalDisco>;
  moverDefinitivo(referenciaTemporal: string, anio: number, cargaId: string, extension: "xlsx" | "csv"): Promise<string>;
  // `null` si el archivo ya no existe.
  abrirLectura(referencia: string): Promise<ArchivoAbiertoDisco | null>;
  // Idempotente: eliminar algo que ya no existe no es un error.
  eliminar(referencia: string): Promise<void>;
  // Ruta absoluta de una referencia ya validada. Solo para los lectores de infraestructura.
  rutaAbsoluta(referencia: string): string;
  // Al arrancar: elimina los `tmp/*.part` modificados ANTES de `instante` (recepciones que el proceso
  // anterior no alcanzó a terminar). Nunca lanza: cada fallo se registra en errores.txt y se sigue.
  eliminarTemporalesAnterioresA(instante: Date): Promise<ResultadoLimpiezaTemporales>;
};

export type ConfiguracionAlmacenDisco = {
  // Se resuelve al usarlo, nunca al importar (las pruebas lo cambian).
  obtenerDirectorioBase: () => string;
  // Solo para los mensajes de errores.txt (p. ej. "Bioestadística").
  etiqueta: string;
  // Cuántos bytes iniciales se devuelven para revisar la firma del archivo.
  bytesPrimeros: number;
};

function codigoError(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export function crearAlmacenArchivosDisco(configuracion: ConfiguracionAlmacenDisco): AlmacenArchivosDisco {
  const { obtenerDirectorioBase, etiqueta, bytesPrimeros: bytesFirma } = configuracion;

  function base(): string {
    return path.resolve(obtenerDirectorioBase());
  }

  function rutaAbsoluta(referencia: string): string {
    const raiz = base();
    const absoluta = path.resolve(raiz, referencia);

    if (!absoluta.startsWith(raiz + path.sep)) {
      throw new Error("Referencia de archivo fuera del almacén");
    }

    return absoluta;
  }

  async function asegurarDirectorio(ruta: string): Promise<void> {
    await mkdir(ruta, { recursive: true, mode: 0o700 });
  }

  async function guardarTemporal(
    origen: ReadableStream<Uint8Array>,
    limiteBytes: number,
  ): Promise<ResultadoGuardadoTemporalDisco> {
    const referenciaTemporal = `${SUBDIRECTORIO_TEMPORAL}/${randomUUID()}${EXTENSION_TEMPORAL}`;
    const destino = rutaAbsoluta(referenciaTemporal);
    await asegurarDirectorio(path.dirname(destino));

    const archivo = await open(destino, "wx", 0o600);
    const lector = origen.getReader();
    const hash = createHash("sha256");
    const primerosBytes: Uint8Array[] = [];
    let bytesPrimeros = 0;
    let tamanoBytes = 0;
    let completado = false;

    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        tamanoBytes += value.byteLength;

        // El límite se mide MIENTRAS se recibe, no solo por el `Content-Length` declarado.
        if (tamanoBytes > limiteBytes) {
          await lector.cancel().catch(() => undefined);
          return { ok: false, motivo: "EXCEDE_TAMANO" };
        }

        hash.update(value);

        if (bytesPrimeros < bytesFirma) {
          const faltantes = bytesFirma - bytesPrimeros;
          const fragmento = value.subarray(0, faltantes);
          primerosBytes.push(fragmento.slice());
          bytesPrimeros += fragmento.byteLength;
        }

        // Escritura secuencial: el siguiente trozo no se lee hasta escribir este (contrapresión).
        await archivo.write(value);
      }

      if (tamanoBytes === 0) return { ok: false, motivo: "VACIO" };

      completado = true;
      return {
        ok: true,
        referenciaTemporal,
        tamanoBytes,
        sha256: hash.digest("hex"),
        primerosBytes: Buffer.concat(primerosBytes),
      };
    } finally {
      lector.releaseLock();
      // Un fallo al cerrar no debe reemplazar el error (o el resultado) original del bloque `try`: se
      // registra y se sigue. Si el archivo no se completó, igual se intenta eliminar.
      try {
        await archivo.close();
      } catch (error) {
        logger.error(`Error al cerrar un temporal de ${etiqueta}`, detalleErrorSeguro(error));
      }
      if (!completado) await rm(destino, { force: true });
    }
  }

  async function moverDefinitivo(
    referenciaTemporal: string,
    anio: number,
    cargaId: string,
    extension: "xlsx" | "csv",
  ): Promise<string> {
    if (!Number.isInteger(anio) || !FORMA_UUID.test(cargaId)) {
      throw new Error("Datos inválidos para ubicar el archivo definitivo");
    }

    const referencia = `${anio}/${cargaId}.${extension}`;
    const destino = rutaAbsoluta(referencia);
    await asegurarDirectorio(path.dirname(destino));
    await rename(rutaAbsoluta(referenciaTemporal), destino);
    return referencia;
  }

  async function abrirLectura(referencia: string): Promise<ArchivoAbiertoDisco | null> {
    const ruta = rutaAbsoluta(referencia);

    try {
      const informacion = await stat(ruta);
      if (!informacion.isFile()) return null;

      const flujo = Readable.toWeb(createReadStream(ruta)) as ReadableStream<Uint8Array>;
      return { flujo, tamanoBytes: informacion.size };
    } catch (error) {
      if (codigoError(error) === "ENOENT") return null;
      throw error;
    }
  }

  async function eliminar(referencia: string): Promise<void> {
    await rm(rutaAbsoluta(referencia), { force: true });
  }

  // El corte por fecha de modificación protege una recepción que haya empezado después del arranque
  // (su temporal se escribe, y por tanto se modifica, después de `instante`). Solo se consideran
  // nombres con la forma que genera `guardarTemporal` (`<uuid>.part`).
  async function eliminarTemporalesAnterioresA(instante: Date): Promise<ResultadoLimpiezaTemporales> {
    const resultado: ResultadoLimpiezaTemporales = { eliminados: 0, fallidos: 0 };
    let nombres: string[];

    try {
      nombres = await readdir(rutaAbsoluta(SUBDIRECTORIO_TEMPORAL));
    } catch (error) {
      // Sin directorio temporal no hay nada que limpiar.
      if (codigoError(error) === "ENOENT") return resultado;
      logger.error(`Error al listar los temporales de ${etiqueta} al arrancar`, detalleErrorSeguro(error));
      resultado.fallidos += 1;
      return resultado;
    }

    const temporales = nombres.filter(
      (nombre) => nombre.endsWith(EXTENSION_TEMPORAL) && FORMA_UUID.test(nombre.slice(0, -EXTENSION_TEMPORAL.length)),
    );

    await Promise.all(
      temporales.map(async (nombre) => {
        const ruta = rutaAbsoluta(`${SUBDIRECTORIO_TEMPORAL}/${nombre}`);
        try {
          const informacion = await stat(ruta);
          if (!informacion.isFile() || informacion.mtime >= instante) return;
          await rm(ruta, { force: true });
          resultado.eliminados += 1;
        } catch (error) {
          if (codigoError(error) === "ENOENT") return;
          resultado.fallidos += 1;
          logger.error(`Error al eliminar un temporal de ${etiqueta} al arrancar`, {
            temporal: nombre,
            ...detalleErrorSeguro(error),
          });
        }
      }),
    );

    return resultado;
  }

  return { guardarTemporal, moverDefinitivo, abrirLectura, eliminar, rutaAbsoluta, eliminarTemporalesAnterioresA };
}
