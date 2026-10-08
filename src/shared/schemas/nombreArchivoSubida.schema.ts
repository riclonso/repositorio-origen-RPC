import { z } from "zod";

// Nombre original de un archivo subido como cuerpo crudo (no multipart): viaja en la cabecera
// `X-Nombre-Archivo` codificado con `encodeURIComponent` (las cabeceras HTTP no admiten tildes).
// Compartido por la subida de Bioestadística (RF-37) y la del notificador (RF-38). Solo se muestra y se
// usa en el `Content-Disposition` de la descarga: NUNCA forma parte de una ruta en disco.

export const CABECERA_NOMBRE_ARCHIVO = "x-nombre-archivo";

export const LONGITUD_MAXIMA_NOMBRE_ARCHIVO_SUBIDA = 255;

// Caracteres de control (incluidos NUL y saltos de línea): no tienen cabida en un nombre de archivo
// y podrían romper el `Content-Disposition` de la descarga.
function tieneCaracteresControl(texto: string): boolean {
  for (const caracter of texto) {
    const codigo = caracter.charCodeAt(0);
    if (codigo < 0x20 || codigo === 0x7f) return true;
  }
  return false;
}

// Se decodifica aquí; un valor mal codificado se trata como inválido. Reglas de RF-37 sin cambios.
export const nombreArchivoSubidaSchema = z.preprocess(
  (valor) => {
    if (typeof valor !== "string") return valor;
    try {
      return decodeURIComponent(valor).trim();
    } catch {
      return "";
    }
  },
  z
    .string({ error: "Indica el nombre del archivo" })
    .min(1, "Indica el nombre del archivo")
    .max(
      LONGITUD_MAXIMA_NOMBRE_ARCHIVO_SUBIDA,
      `El nombre del archivo no puede superar los ${LONGITUD_MAXIMA_NOMBRE_ARCHIVO_SUBIDA} caracteres`,
    )
    .refine((nombre) => !tieneCaracteresControl(nombre), "El nombre del archivo no es válido"),
);

// RF-38: variante del notificador, que además rechaza separadores de ruta (`/`, `\`). Bioestadística
// no la usa para no cambiar sus reglas.
export const nombreArchivoSubidaSinRutaSchema = nombreArchivoSubidaSchema.refine(
  (nombre) => typeof nombre === "string" && !/[\\/]/.test(nombre),
  "El nombre del archivo no es válido",
);
