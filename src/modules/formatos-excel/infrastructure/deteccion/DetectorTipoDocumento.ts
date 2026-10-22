import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Open, type EntradaZip } from "unzipper";
import type { DetectorTipoDocumento } from "@/modules/formatos-excel/application/ports";
import type { ExtensionReglasLlenado } from "@/modules/formatos-excel/domain/entities/ReglasLlenadoFormato";

// RF-45: verifica que el CONTENIDO real del archivo corresponda a su extensión (renombrar un archivo
// no basta para pasar). Trabaja sobre el archivo ya recibido en disco, nunca sobre el cuerpo completo
// en memoria.
//  - docx / xlsx: firma ZIP `50 4B 03 04`, `[Content_Types].xml` presente y que declare partes bajo
//    `/word/` (docx) o `/xl/` (xlsx), y entradas reales en `word/` o `xl/`.
//  - doc / xls: firma OLE2 genérica `D0 CF 11 E0 A1 B1 1A E1` (decisión: no se distingue Word de
//    Excel dentro del contenedor OLE2).
//  - txt: UTF-8 válido (BOM opcional), sin NUL ni caracteres de control fuera de \t, \r y \n.

const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRMA_OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const TAMANO_MAXIMO_CONTENT_TYPES = 1024 * 1024;

async function leerPrimerosBytes(ruta: string, cantidad: number): Promise<Buffer> {
  const archivo = await open(ruta, "r");
  try {
    const buffer = Buffer.alloc(cantidad);
    const { bytesRead } = await archivo.read(buffer, 0, cantidad, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await archivo.close();
  }
}

async function leerEntradaTexto(entrada: EntradaZip): Promise<string> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of entrada.stream()) {
    const buffer = Buffer.isBuffer(parte) ? parte : Buffer.from(parte as Uint8Array);
    total += buffer.byteLength;
    // `uncompressedSize` lo declara el propio ZIP: además de revisarlo, se mide al inflar.
    if (total > TAMANO_MAXIMO_CONTENT_TYPES) throw new Error("[Content_Types].xml demasiado grande");
    partes.push(buffer);
  }
  return Buffer.concat(partes).toString("utf8");
}

async function esOfficeOpenXml(ruta: string, prefijo: "word" | "xl"): Promise<boolean> {
  const firma = await leerPrimerosBytes(ruta, FIRMA_ZIP.length);
  if (!firma.equals(FIRMA_ZIP)) return false;

  let directorio;
  try {
    directorio = await Open.custom({
      stream: (offset, length) => createReadStream(ruta, { start: offset, ...(length ? { end: offset + length } : {}) }),
      size: async () => (await stat(ruta)).size,
    });
  } catch {
    // Un ZIP corrupto o truncado no es un documento válido.
    return false;
  }

  const tiposContenido = directorio.files.find((entrada) => entrada.path === "[Content_Types].xml");
  if (!tiposContenido || tiposContenido.uncompressedSize > TAMANO_MAXIMO_CONTENT_TYPES) return false;

  const tieneEntradas = directorio.files.some(
    (entrada) => entrada.type === "File" && entrada.path.startsWith(`${prefijo}/`),
  );
  if (!tieneEntradas) return false;

  try {
    const texto = await leerEntradaTexto(tiposContenido);
    return texto.includes(`PartName="/${prefijo}/`);
  } catch {
    return false;
  }
}

async function esOle2(ruta: string): Promise<boolean> {
  return (await leerPrimerosBytes(ruta, FIRMA_OLE2.length)).equals(FIRMA_OLE2);
}

function tieneControlNoPermitido(texto: string): boolean {
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    if ((codigo < 0x20 && codigo !== 0x09 && codigo !== 0x0a && codigo !== 0x0d) || codigo === 0x7f) {
      return true;
    }
  }
  return false;
}

async function esTextoUtf8(ruta: string): Promise<boolean> {
  // `fatal: true` rechaza cualquier secuencia UTF-8 inválida; el BOM inicial se consume solo.
  const decodificador = new TextDecoder("utf-8", { fatal: true });
  let tamano = 0;

  try {
    for await (const parte of createReadStream(ruta)) {
      const buffer = parte as Buffer;
      tamano += buffer.byteLength;
      if (tieneControlNoPermitido(decodificador.decode(buffer, { stream: true }))) return false;
    }
    if (tieneControlNoPermitido(decodificador.decode())) return false;
  } catch {
    return false;
  }

  return tamano > 0;
}

// Función pura sobre una ruta absoluta (la usan las pruebas unitarias).
export async function documentoCorrespondeAExtension(
  rutaAbsoluta: string,
  extension: ExtensionReglasLlenado,
): Promise<boolean> {
  const informacion = await stat(rutaAbsoluta);
  if (!informacion.isFile() || informacion.size === 0) return false;

  switch (extension) {
    case "docx":
      return esOfficeOpenXml(rutaAbsoluta, "word");
    case "xlsx":
      return esOfficeOpenXml(rutaAbsoluta, "xl");
    case "doc":
    case "xls":
      return esOle2(rutaAbsoluta);
    case "txt":
      return esTextoUtf8(rutaAbsoluta);
  }
}

export function crearDetectorTipoDocumento(almacen: { rutaAbsoluta(referencia: string): string }): DetectorTipoDocumento {
  return {
    corresponde: (referenciaTemporal, extension) =>
      documentoCorrespondeAExtension(almacen.rutaAbsoluta(referenciaTemporal), extension),
  };
}
