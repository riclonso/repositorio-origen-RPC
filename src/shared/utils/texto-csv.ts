// Decodificación de archivos CSV subidos por usuarios en español. Los CSV exportados desde Excel
// en Windows suelen venir en Windows-1252 (ANSI), no en UTF-8; leerlos siempre como UTF-8 rompe
// la "ñ" y las tildes ("AÃ±o" en vez de "Año"). Y los que sí vienen en UTF-8 a menudo traen el
// BOM (EF BB BF), que sin quitarlo queda pegado al primer encabezado.
//
// Estrategia: se quita el BOM y se intenta UTF-8 ESTRICTO (`fatal: true`, lanza ante cualquier
// secuencia inválida). Si falla, el archivo no es UTF-8 y se decodifica como Windows-1252, que
// asigna un carácter a cada byte y por lo tanto nunca falla. Función pura, sin E/S.

const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const;

export const PREFIJO_BOM_UTF8 = Buffer.from(BOM_UTF8);

function empiezaConBomUtf8(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === BOM_UTF8[0] && bytes[1] === BOM_UTF8[1] && bytes[2] === BOM_UTF8[2];
}

export function decodificarTextoCsv(contenido: Uint8Array): string {
  const sinBom = empiezaConBomUtf8(contenido) ? contenido.subarray(3) : contenido;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(sinBom);
  } catch {
    return new TextDecoder("windows-1252").decode(sinBom);
  }
}

export type CodificacionCsv = "utf-8" | "windows-1252";

// RF-37: misma decisión que `decodificarTextoCsv` (UTF-8 estricto; si falla, Windows-1252), pero
// sobre un flujo de bytes que no cabe en memoria (archivos de hasta 300 MB). Recorre los trozos con
// un `TextDecoder` estricto en modo `stream` (una secuencia multibyte partida entre dos trozos no es
// un error) y descarta el texto decodificado: solo importa si alguna secuencia es inválida. El BOM
// es UTF-8 válido, así que no altera la decisión. Sin E/S propia: el llamador aporta los trozos.
export async function detectarCodificacionCsvStreaming(trozos: AsyncIterable<Uint8Array>): Promise<CodificacionCsv> {
  const decodificador = new TextDecoder("utf-8", { fatal: true });

  try {
    for await (const trozo of trozos) {
      decodificador.decode(trozo, { stream: true });
    }
    // Cierre del flujo: lanza si el archivo termina a mitad de una secuencia multibyte.
    decodificador.decode();
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

// Separadores que se reconocen al detectar automáticamente el de un CSV de formato libre (RF-37),
// en orden de preferencia ante un empate.
const SEPARADORES_CANDIDATOS = [";", ",", "\t", "|"] as const;

// RF-37: elige el separador de un CSV de formato libre a partir de su PRIMERA línea (la de
// encabezados): el candidato que más veces aparece FUERA de comillas. Sin ninguno, coma (un CSV de
// una sola columna). Función pura.
export function detectarSeparadorCsv(primeraLinea: string): string {
  const conteos = new Map<string, number>(SEPARADORES_CANDIDATOS.map((separador) => [separador, 0]));
  let dentroDeComillas = false;

  for (const caracter of primeraLinea) {
    if (caracter === '"') {
      dentroDeComillas = !dentroDeComillas;
      continue;
    }

    if (!dentroDeComillas && conteos.has(caracter)) {
      conteos.set(caracter, (conteos.get(caracter) ?? 0) + 1);
    }
  }

  let elegido = ",";
  let maximo = 0;

  for (const separador of SEPARADORES_CANDIDATOS) {
    const conteo = conteos.get(separador) ?? 0;
    if (conteo > maximo) {
      elegido = separador;
      maximo = conteo;
    }
  }

  return elegido;
}

// Quita el BOM UTF-8 del inicio de un texto ya decodificado: "﻿" si se decodificó como UTF-8, o
// sus tres bytes vistos como Windows-1252 ("ï»¿"), mismo efecto que `decodificarTextoCsv`.
export function quitarBomTexto(texto: string): string {
  if (texto.startsWith("﻿")) return texto.slice(1);
  if (texto.startsWith("ï»¿")) return texto.slice(3);
  return texto;
}

// Antepone el BOM UTF-8 a un CSV generado por el sistema: sin él, Excel en Windows abre el
// archivo como ANSI y vuelve a mostrar mojibake en la "ñ" y las tildes.
export function agregarBomUtf8(contenido: Uint8Array): Buffer {
  return empiezaConBomUtf8(contenido)
    ? Buffer.from(contenido)
    : Buffer.concat([PREFIJO_BOM_UTF8, Buffer.from(contenido)]);
}
