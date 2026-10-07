import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PassThrough, Transform, type Readable, type TransformCallback } from "node:stream";
import ExcelJS from "exceljs";
import { Open, type EntradaZip, type FuenteZip } from "unzipper";
import { celdaAValor, type ValorCeldaPrimitivo } from "@/infrastructure/hojas-calculo/valorCelda";

// Fila leída en streaming: número real de la fila en la hoja (1-based) y sus valores por columna
// (posición 0 = columna A). Las celdas sin valor quedan en `null`.
export type FilaHojaStreaming = { numeroFila: number; valores: ValorCeldaPrimitivo[] };

// `styles: "cache"` es necesario para reconocer las celdas con formato de fecha (sin él llegarían
// como número de serie). `sharedStrings: "cache"` deja en memoria la tabla de textos compartidos:
// aceptable porque deduplica.
const OPCIONES_LECTOR: Partial<ExcelJS.stream.xlsx.WorkbookStreamReaderOptions> = {
  worksheets: "emit",
  sharedStrings: "cache",
  styles: "cache",
  hyperlinks: "ignore",
};

// POR QUÉ NO SE USA `WorkbookReader` TAL CUAL. Su lectura secuencial del ZIP (exceljs 4.4 sobre
// unzipper 0.10) PIERDE entradas de forma no determinista: verificado que, sobre el mismo archivo,
// a veces procesa la hoja sin haber leído `sharedStrings.xml` (los textos llegan como
// `{ sharedString: n }`), `styles.xml` (las fechas llegan como número) o `workbook.xml` (lanza
// `TypeError`). Sería una corrupción silenciosa de datos. En su lugar se abre el ZIP por su
// DIRECTORIO CENTRAL (acceso aleatorio, `unzipper.Open`) y se entregan a los mismos parsers de
// exceljs las partes en el orden que necesitan: relaciones → libro → estilos → textos compartidos
// → primera hoja (según el orden del libro, no del ZIP). Cada parte se descomprime en streaming.
// Se usan métodos internos de `WorkbookReader` (`_parse*`): el contrato queda acotado a este
// archivo, y exceljs 4.4.0 es su última versión publicada.
type LectorLibroInterno = {
  _parseRels(entrada: Readable): Promise<void>;
  _parseWorkbook(entrada: Readable): Promise<void>;
  _parseStyles(entrada: Readable): Promise<void>;
  _parseSharedStrings(entrada: Readable): AsyncGenerator<unknown>;
  _parseWorksheet(
    iterador: AsyncIterable<unknown>,
    numeroHoja: string,
  ): Generator<{ eventType: string; value: ExcelJS.stream.xlsx.WorksheetReader }>;
  workbookRels?: { Id: string; Target: string }[];
  model?: { sheets?: { rId: string }[] };
};

const RUTA_HOJA_POR_DEFECTO = "xl/worksheets/sheet1.xml";

// Tope de bytes DESCOMPRIMIDOS de cada parte que los parsers de exceljs retienen completa en memoria
// (relaciones, libro, estilos y textos compartidos). Defensa contra una bomba ZIP: un archivo de
// 200 MB comprimido podría declarar gigabytes de `sharedStrings.xml`. La hoja NO lleva este tope:
// se recorre fila a fila sin retenerla, y su volumen ya lo acota el tope de filas del procesamiento.
export const TOPE_BYTES_PARTE_XLSX = 256 * 1024 * 1024;

export type OpcionesLecturaXlsx = {
  // Solo para pruebas: por defecto `TOPE_BYTES_PARTE_XLSX`.
  topeBytesParte?: number;
};

// Una parte del xlsx excede el tope descomprimido. Quien lee lo trata como cualquier otro error de
// lectura (archivo ilegible); el mensaje no lleva contenido del archivo.
export class ParteXlsxDemasiadoGrandeError extends Error {
  constructor(readonly rutaParte: string) {
    super(`La parte ${rutaParte} del xlsx excede el tamaño descomprimido permitido`);
    this.name = "ParteXlsxDemasiadoGrandeError";
  }
}

// Fuente del ZIP que registra cada lectura abierta sobre el archivo, para cerrarlas TODAS al
// terminar (o al cortar la iteración): en Windows un descriptor abierto impide renombrar o borrar el
// archivo después.
type FuenteRastreada = {
  fuente: FuenteZip;
  abrirEntrada(entrada: EntradaZip, topeBytes?: number): Readable;
  cerrar(): void;
};

// Cuenta los bytes REALES que salen del descompresor y corta con error al superar el tope. El
// tamaño descomprimido declarado en el directorio central lo escribe quien arma el ZIP (se falsea
// trivialmente) y `unzipper` no lo hace cumplir al inflar: por eso además de revisarlo se mide.
function crearContadorConTope(rutaParte: string, topeBytes: number): Transform {
  let leidos = 0;

  return new Transform({
    transform(trozo: Buffer, _codificacion: BufferEncoding, listo: TransformCallback) {
      leidos += trozo.length;
      if (leidos > topeBytes) {
        listo(new ParteXlsxDemasiadoGrandeError(rutaParte));
        return;
      }
      listo(null, trozo);
    },
  });
}

function crearFuenteRastreada(ruta: string): FuenteRastreada {
  const abiertas: ReadStream[] = [];
  let cerrada = false;

  return {
    fuente: {
      stream(offset, length) {
        const lectura = createReadStream(ruta, { start: offset, ...(length ? { end: offset + length } : {}) });
        abiertas.push(lectura);
        return lectura;
      },
      size: async () => (await stat(ruta)).size,
    },
    // Los parsers de exceljs iteran con `for await`: un `PassThrough` de Node lo admite. Un error de
    // descompresión se propaga al iterador; después de cerrar (corte deliberado) ya no hay quién lo
    // escuche y se ignora, para no convertirlo en una excepción no capturada del proceso. Con tope,
    // el flujo es un contador que se destruye con `ParteXlsxDemasiadoGrandeError` al superarlo, y
    // entonces se deja de inflar el origen.
    abrirEntrada(entrada, topeBytes) {
      if (topeBytes !== undefined && entrada.uncompressedSize > topeBytes) {
        throw new ParteXlsxDemasiadoGrandeError(entrada.path);
      }

      const flujo: Transform = topeBytes === undefined ? new PassThrough() : crearContadorConTope(entrada.path, topeBytes);
      const origen = entrada.stream();
      origen.on("error", (error: Error) => {
        if (!cerrada) flujo.destroy(error);
      });
      flujo.on("error", () => {
        origen.unpipe(flujo);
        origen.destroy();
      });
      origen.pipe(flujo);
      return flujo;
    },
    cerrar() {
      cerrada = true;
      for (const lectura of abiertas) lectura.destroy();
    },
  };
}

async function consumir(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const evento of iterable) void evento;
}

// Ruta en el ZIP de la PRIMERA hoja según el orden del libro (`workbook.xml`), resuelta con sus
// relaciones. El destino puede venir relativo a `xl/` o absoluto desde la raíz del paquete.
function rutaPrimeraHoja(lector: LectorLibroInterno): string {
  const relacion = lector.model?.sheets?.[0]?.rId;
  const destino = lector.workbookRels?.find((rel) => rel.Id === relacion)?.Target;
  if (!destino) return RUTA_HOJA_POR_DEFECTO;
  return destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
}

function valoresDeFila(fila: ExcelJS.Row): ValorCeldaPrimitivo[] {
  // `fila.values` es un arreglo disperso 1-based (posición 0 vacía); se normaliza a 0-based y sin
  // huecos para que la posición `i` corresponda siempre a la columna `i + 1`.
  const crudos = fila.values as ExcelJS.CellValue[];
  const valores: ValorCeldaPrimitivo[] = [];

  for (let indice = 1; indice < crudos.length; indice += 1) {
    valores.push(celdaAValor(crudos[indice]));
  }

  return valores;
}

// RF-37: ÚNICO punto de lectura en streaming de archivos .xlsx con exceljs (mismo criterio que
// `abrirHojaExcelJs.ts` para la lectura en memoria). Recorre solo la PRIMERA hoja del libro y nunca
// carga el libro completo en memoria. Lanza si el archivo no es un ZIP/xlsx válido, o
// `ParteXlsxDemasiadoGrandeError` si una parte retenida en memoria supera el tope descomprimido.
export async function* recorrerFilasPrimeraHojaXlsx(
  ruta: string,
  opciones: OpcionesLecturaXlsx = {},
): AsyncGenerator<FilaHojaStreaming> {
  const { fuente, abrirEntrada, cerrar } = crearFuenteRastreada(ruta);
  const tope = opciones.topeBytesParte ?? TOPE_BYTES_PARTE_XLSX;

  try {
    const directorio = await Open.custom(fuente);
    const buscar = (rutaEntrada: string) => directorio.files.find((entrada) => entrada.path === rutaEntrada);
    const lector = new ExcelJS.stream.xlsx.WorkbookReader(ruta, OPCIONES_LECTOR) as unknown as LectorLibroInterno;

    const relaciones = buscar("xl/_rels/workbook.xml.rels");
    if (relaciones) await lector._parseRels(abrirEntrada(relaciones, tope));

    const libro = buscar("xl/workbook.xml");
    if (libro) await lector._parseWorkbook(abrirEntrada(libro, tope));

    const estilos = buscar("xl/styles.xml");
    if (estilos) await lector._parseStyles(abrirEntrada(estilos, tope));

    const textos = buscar("xl/sharedStrings.xml");
    if (textos) await consumir(lector._parseSharedStrings(abrirEntrada(textos, tope)));

    const rutaHoja = rutaPrimeraHoja(lector);
    const hoja = buscar(rutaHoja);
    if (!hoja) return;

    const numeroHoja = /sheet(\d+)\.xml$/.exec(rutaHoja)?.[1] ?? "1";

    for (const evento of lector._parseWorksheet(abrirEntrada(hoja), numeroHoja)) {
      if (evento.eventType !== "worksheet") continue;
      for await (const fila of evento.value) {
        yield { numeroFila: fila.number, valores: valoresDeFila(fila) };
      }
    }
  } finally {
    cerrar();
  }
}
