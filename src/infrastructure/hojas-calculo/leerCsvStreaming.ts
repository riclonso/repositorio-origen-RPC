import { createReadStream } from "node:fs";
import { Transform, pipeline } from "node:stream";
import { parse } from "@fast-csv/parse";
import {
  detectarCodificacionCsvStreaming,
  detectarSeparadorCsv,
  quitarBomTexto,
  type CodificacionCsv,
} from "@/shared/utils/texto-csv";

// Registro de un CSV leído en streaming: número de registro (1-based; el 1 son los encabezados) y
// sus campos como texto, sin interpretar.
export type RegistroCsvStreaming = { numeroRegistro: number; campos: string[] };

// Tope de la primera línea al detectar el separador: una "línea" de más de 1 MB no es una fila de
// encabezados razonable y no debe leerse entera en memoria.
const TOPE_BYTES_PRIMERA_LINEA = 1024 * 1024;

// Transform que decodifica bytes a texto con la codificación ya decidida, en modo `stream` (una
// secuencia multibyte partida entre dos trozos se completa con el siguiente) y quita el BOM del
// inicio, mismo efecto que `decodificarTextoCsv` pero sin cargar el archivo completo.
function crearDecodificador(codificacion: CodificacionCsv): Transform {
  const decodificador = new TextDecoder(codificacion);
  let primerTrozo = true;

  return new Transform({
    transform(trozo: Buffer, _codificacion, listo) {
      let texto = decodificador.decode(trozo, { stream: true });
      if (primerTrozo && texto.length > 0) {
        texto = quitarBomTexto(texto);
        primerTrozo = false;
      }
      listo(null, texto);
    },
    flush(listo) {
      listo(null, decodificador.decode());
    },
  });
}

async function leerPrimeraLinea(ruta: string, codificacion: CodificacionCsv): Promise<string> {
  const fuente = createReadStream(ruta, { end: TOPE_BYTES_PRIMERA_LINEA - 1 });
  const decodificador = new TextDecoder(codificacion);
  let acumulado = "";

  try {
    for await (const trozo of fuente) {
      acumulado += decodificador.decode(trozo as Buffer, { stream: true });
      const finLinea = acumulado.search(/\r?\n/);
      if (finLinea !== -1) return quitarBomTexto(acumulado.slice(0, finLinea));
    }
    return quitarBomTexto(acumulado);
  } finally {
    fuente.destroy();
  }
}

// RF-37: lectura en streaming de un CSV de formato libre (hasta 200 MB) sin cargarlo en memoria.
//  1. Primera pasada: decide UTF-8 o Windows-1252 (`detectarCodificacionCsvStreaming`).
//  2. Detecta el separador sobre la primera línea (`detectarSeparadorCsv`).
//  3. Segunda pasada: archivo → decodificador → `@fast-csv/parse`, registro a registro.
// Cortar la iteración antes de terminar destruye los flujos y cierra el archivo.
export async function* recorrerRegistrosCsv(ruta: string): AsyncGenerator<RegistroCsvStreaming> {
  const codificacion = await detectarCodificacionCsvStreaming(createReadStream(ruta));
  const separador = detectarSeparadorCsv(await leerPrimeraLinea(ruta, codificacion));

  const fuente = createReadStream(ruta);
  const analizador = parse<string[], string[]>({ delimiter: separador, headers: false, ignoreEmpty: false });

  // `pipeline` propaga al analizador cualquier error de la lectura o la decodificación, que el
  // `for await` de abajo relanza al llamador.
  pipeline(fuente, crearDecodificador(codificacion), analizador, (error) => {
    if (error) analizador.destroy(error);
  });

  let numeroRegistro = 0;

  try {
    for await (const campos of analizador as AsyncIterable<string[]>) {
      numeroRegistro += 1;
      yield { numeroRegistro, campos };
    }
  } finally {
    fuente.destroy();
    analizador.destroy();
  }
}
