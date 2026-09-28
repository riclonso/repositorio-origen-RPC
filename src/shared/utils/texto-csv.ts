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

// Antepone el BOM UTF-8 a un CSV generado por el sistema: sin él, Excel en Windows abre el
// archivo como ANSI y vuelve a mostrar mojibake en la "ñ" y las tildes.
export function agregarBomUtf8(contenido: Uint8Array): Buffer {
  return empiezaConBomUtf8(contenido)
    ? Buffer.from(contenido)
    : Buffer.concat([PREFIJO_BOM_UTF8, Buffer.from(contenido)]);
}
