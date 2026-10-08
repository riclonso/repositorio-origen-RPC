import { createReadStream, type ReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PassThrough, Readable, Transform, type TransformCallback } from "node:stream";
import ExcelJS from "exceljs";
import parseSax from "exceljs/lib/utils/parse-sax";
import { excelToDate, isDateFmt, xmlDecode } from "exceljs/lib/utils/utils";
import colCache from "exceljs/lib/utils/col-cache";
import { Open, type EntradaZip, type FuenteZip } from "unzipper";
import { celdaAValor, type ValorCeldaPrimitivo } from "@/infrastructure/hojas-calculo/valorCelda";

// Fila leída en streaming: número real de la fila en la hoja (1-based) y sus valores por columna
// (posición 0 = columna A). Las celdas sin valor quedan en `null`. Con `celdasComoLecturaEnMemoria`
// trae además `crudos`: el valor de exceljs SIN convertir (objetos de fórmula, hipervínculo, texto
// enriquecido...), para quien necesite distinguirlos.
export type FilaHojaStreaming = {
  numeroFila: number;
  valores: ValorCeldaPrimitivo[];
  crudos?: ExcelJS.CellValue[];
};

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
  properties?: { model?: { date1904?: boolean } };
  styles?: { getStyleModel(id: number): { numFmt?: string } | undefined };
};

const RUTA_HOJA_POR_DEFECTO = "xl/worksheets/sheet1.xml";

// Tope de bytes DESCOMPRIMIDOS de cada parte que los parsers de exceljs retienen completa en memoria
// (relaciones, libro, estilos y textos compartidos). Defensa contra una bomba ZIP: un archivo de
// 200 MB comprimido podría declarar gigabytes de `sharedStrings.xml`. La hoja NO lleva este tope:
// se recorre fila a fila sin retenerla. Su volumen lo acota el tope de filas del procesamiento o,
// si quien lee lo pide, `topeBytesHoja`.
export const TOPE_BYTES_PARTE_XLSX = 256 * 1024 * 1024;

// RF-38: máximo de rangos combinados (`<mergeCell>`) que se aceptan con `aplicarCeldasCombinadas`.
export const TOPE_RANGOS_COMBINADOS = 100_000;

// RF-38: máximo de hipervínculos que se recuerdan con `celdasComoLecturaEnMemoria`.
export const TOPE_HIPERVINCULOS = 1_000_000;

// Columnas que admite una hoja de Excel (A..XFD).
const MAXIMO_COLUMNAS_HOJA = 16_384;

// `{ buffer }` (RF-38): soporte permanente de las cargas del notificador anteriores al almacenamiento en
// disco, cuyo binario sigue en la base.
export type FuenteXlsx = string | { ruta: string } | { buffer: Buffer } | { fuenteZip: FuenteZip };

// Todas las opciones de RF-38 son ADITIVAS: sin ellas (como llama Bioestadística) el lector se comporta
// exactamente como en RF-37.
export type OpcionesLecturaXlsx = {
  // Solo para pruebas: por defecto `TOPE_BYTES_PARTE_XLSX`.
  topeBytesParte?: number;
  // RF-38: tope de bytes descomprimidos de la HOJA de datos (bomba ZIP de filas vacías o celdas
  // repetidas, que el tope de filas no frena porque esas filas no cuentan como datos). Medido con
  // los bytes reales. Al superarlo lanza `ParteXlsxDemasiadoGrandeError`.
  topeBytesHoja?: number;
  // RF-38: rellena cada celda secundaria de un rango combinado con el valor de la principal, como
  // `xlsx.load`. Exige una primera pasada por la hoja (los rangos están DESPUÉS de los datos). Igual
  // que en memoria, las filas cubiertas por un rango existen aunque el archivo no traiga su `<row>`.
  aplicarCeldasCombinadas?: boolean;
  // RF-38: interpreta cada celda exactamente como `xlsx.load` (que no es lo mismo que el lector en
  // streaming de exceljs): fórmulas booleanas, de error y de fecha; texto enriquecido también en
  // `inlineStr`; escapes `_xHHHH_`; hipervínculos. (La decodificación UTF-8 segura entre trozos
  // aplica a todos los caminos, ver `abrirEntrada`.)
  // Expone `crudos` en cada fila.
  celdasComoLecturaEnMemoria?: boolean;
  // RF-38: se ignoran las columnas posteriores a esta (acota la memoria por fila). Por defecto, todas.
  maximoColumnas?: number;
};

// Una parte del xlsx excede el tope descomprimido. Quien lee lo trata como cualquier otro error de
// lectura (archivo ilegible); el mensaje no lleva contenido del archivo.
export class ParteXlsxDemasiadoGrandeError extends Error {
  constructor(readonly rutaParte: string) {
    super(`La parte ${rutaParte} del xlsx excede el tamaño descomprimido permitido`);
    this.name = "ParteXlsxDemasiadoGrandeError";
  }
}

// El archivo es un xlsx, pero su contenido no se puede interpretar (rangos combinados que se
// solapan, textos compartidos inexistentes, demasiados rangos...). Sin contenido del archivo.
export class HojaXlsxInvalidaError extends Error {
  constructor(motivo: string) {
    super(`La hoja del xlsx no es válida: ${motivo}`);
    this.name = "HojaXlsxInvalidaError";
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

function crearFuenteZip(origen: FuenteXlsx, abiertas: Readable[]): FuenteZip {
  if (typeof origen === "object" && "fuenteZip" in origen) {
    return {
      stream(offset, length) { const lectura = origen.fuenteZip.stream(offset, length); abiertas.push(lectura); return lectura; },
      size: () => origen.fuenteZip.size(),
    };
  }
  if (typeof origen === "object" && "buffer" in origen) {
    const contenido = origen.buffer;
    return {
      stream(offset, length) {
        const fin = length ? offset + length + 1 : contenido.length;
        const lectura = Readable.from([contenido.subarray(offset, Math.min(fin, contenido.length))]);
        abiertas.push(lectura);
        return lectura;
      },
      size: async () => contenido.length,
    };
  }

  const ruta = typeof origen === "string" ? origen : origen.ruta;
  return {
    stream(offset, length) {
      const lectura: ReadStream = createReadStream(ruta, { start: offset, ...(length ? { end: offset + length } : {}) });
      abiertas.push(lectura);
      return lectura;
    },
    size: async () => (await stat(ruta)).size,
  };
}

function crearFuenteRastreada(origen: FuenteXlsx): FuenteRastreada {
  const abiertas: Readable[] = [];
  let cerrada = false;

  return {
    fuente: crearFuenteZip(origen, abiertas),
    // Los parsers de exceljs iteran con `for await`: un `PassThrough` de Node lo admite. Un error de
    // descompresión se propaga al iterador; después de cerrar (corte deliberado) ya no hay quién lo
    // escuche y se ignora, para no convertirlo en una excepción no capturada del proceso. Con tope,
    // el flujo es un contador que se destruye con `ParteXlsxDemasiadoGrandeError` al superarlo, y
    // entonces se deja de inflar el origen.
    //
    // El flujo entrega SIEMPRE texto ya decodificado con un decodificador UTF-8 en modo stream
    // (`setEncoding`). Sin esto, exceljs decodifica cada trozo por separado y un carácter multibyte
    // (ñ, tildes) partido entre dos trozos queda como U+FFFD: corrupción silenciosa que afectaba a
    // Bioestadística (RF-37), corregida en RF-38. El analizador SAX de exceljs acepta texto tal cual.
    abrirEntrada(entrada, topeBytes) {
      if (topeBytes !== undefined && entrada.uncompressedSize > topeBytes) {
        throw new ParteXlsxDemasiadoGrandeError(entrada.path);
      }

      const flujo: Transform = topeBytes === undefined ? new PassThrough() : crearContadorConTope(entrada.path, topeBytes);
      const origenEntrada = entrada.stream();
      origenEntrada.on("error", (error: Error) => {
        if (!cerrada) flujo.destroy(error);
      });
      flujo.on("error", () => {
        origenEntrada.unpipe(flujo);
        origenEntrada.destroy();
      });
      origenEntrada.pipe(flujo);
      abiertas.push(origenEntrada);
      flujo.setEncoding("utf8");
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

// `xl/worksheets/sheet1.xml` → `xl/worksheets/_rels/sheet1.xml.rels`.
function rutaRelacionesHoja(rutaHoja: string): string {
  const separador = rutaHoja.lastIndexOf("/");
  return `${rutaHoja.slice(0, separador)}/_rels/${rutaHoja.slice(separador + 1)}.rels`;
}

// Número de fila de un `<row>`: el declarado en `r` o, si falta (válido en el estándar), el anterior
// + 1. Debe ser un entero seguro y ESTRICTAMENTE creciente: con números repetidos o descendentes el
// recorrido en streaming no puede reproducir la hoja (y se saltarían el tope de filas y el conteo),
// y sin número la fila quedaría como `NaN`. Se rechaza el archivo en vez de interpretarlo a medias.
// Aplica a todos los caminos del lector (notificador y Bioestadística).
function numeroFilaValidado(declarado: string | number | undefined, ultimaFilaLeida: number): number {
  const numero =
    declarado === undefined || (typeof declarado === "number" && Number.isNaN(declarado))
      ? ultimaFilaLeida + 1
      : Number(declarado);
  if (!Number.isSafeInteger(numero) || numero <= ultimaFilaLeida) {
    throw new HojaXlsxInvalidaError("filas fuera de orden o con número inválido");
  }
  return numero;
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

// ---------------------------------------------------------------------------------------------
// RF-38: interpretación de celdas idéntica a `xlsx.load`
// ---------------------------------------------------------------------------------------------
//
// Réplica, sobre el mismo analizador SAX de exceljs, de `SharedStringXform`, `CellXform` (apertura,
// texto, cierre y `reconcile`) y la aplicación de hipervínculos y combinadas de `WorksheetXform` /
// `Worksheet`. La prueba de equivalencia (`tests/equivalencia-validacion.unit.ts`) compara este
// camino con `xlsx.load` sobre un corpus que cubre cada rama.

type Fragmento = { text?: string };
type TextoCompartido = string | { richText: Fragmento[] } | Record<string, never>;

// `TextXform.model`: los escapes `_xHHHH_` (hex en MAYÚSCULAS) se convierten en su carácter.
function decodificarEscapes(texto: string): string {
  return texto.replace(/_x([0-9A-F]{4})_/g, (_coincidencia, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// Los textos que entrega el analizador SAX son, en V8, recortes (`SlicedString`) del trozo de XML de
// 64 KB del que salieron: guardarlos tal cual en la tabla de textos compartidos retiene TODO el XML
// de esa parte (medido: 1,6 GB de RSS con 4 millones de textos únicos). Concatenar y recortar obliga
// a V8 a crear una cadena propia del tamaño del texto.
function copiaIndependiente(texto: string): string {
  return ` ${texto}`.slice(1);
}

// Tabla de textos compartidos como `SharedStringXform`: `<t>` → texto, `<r>` → texto enriquecido,
// `<rPh>` (fonética) se ignora, `<si/>` sin contenido → objeto vacío.
async function leerTextosCompartidos(entrada: Readable): Promise<TextoCompartido[]> {
  const textos: TextoCompartido[] = [];
  let modelo: TextoCompartido | null = null;
  let profundidadFonetica = 0;
  let enFragmento = false;
  let fragmento: Fragmento | null = null;
  let acumulado: string[] | null = null;

  for await (const eventos of parseSax(entrada)) {
    for (const evento of eventos) {
      if (evento.eventType === "opentag") {
        const nombre = evento.value.name;
        if (profundidadFonetica > 0) {
          if (nombre === "rPh") profundidadFonetica += 1;
          continue;
        }
        if (nombre === "si") {
          modelo = {};
        } else if (nombre === "rPh") {
          profundidadFonetica = 1;
        } else if (nombre === "r") {
          enFragmento = true;
          fragmento = {};
        } else if (nombre === "t") {
          acumulado = [];
        }
      } else if (evento.eventType === "text") {
        if (profundidadFonetica === 0 && acumulado) acumulado.push(evento.value);
      } else {
        const nombre = evento.value.name;
        if (profundidadFonetica > 0) {
          if (nombre === "rPh") profundidadFonetica -= 1;
          continue;
        }
        if (nombre === "t" && acumulado) {
          const texto = copiaIndependiente(decodificarEscapes(acumulado.join("")));
          acumulado = null;
          if (enFragmento && fragmento) fragmento.text = texto;
          else modelo = texto;
        } else if (nombre === "r" && fragmento) {
          // Un fragmento después de un `<t>` directo no altera el texto (exceljs lo descarta).
          if (modelo !== null && typeof modelo === "object") {
            const enriquecido = modelo as { richText?: Fragmento[] };
            (enriquecido.richText ??= []).push(fragmento);
          }
          fragmento = null;
          enFragmento = false;
        } else if (nombre === "si") {
          textos.push(modelo ?? {});
          modelo = null;
        }
      }
    }
  }

  return textos;
}

type ContextoCeldas = {
  textos: TextoCompartido[];
  date1904: boolean;
  estiloEsFecha(idEstilo: number): boolean;
  hipervinculos: ReadonlySet<string>;
};

type CeldaEnLectura = {
  direccion: string;
  tipo: string | undefined;
  idEstilo: number | undefined;
  formula: string | undefined;
  compartida: string | undefined;
  valor: string | { richText: Fragmento[] } | undefined;
  nodoActual: "f" | "v" | "t" | undefined;
  fragmento: Fragmento | null;
  textoFragmento: string[] | null;
};

// `CellXform.parseClose("c")` + `reconcile`: el valor que devolvería `getCell().value` en memoria.
function valorDeCelda(celda: CeldaEnLectura, contexto: ContextoCeldas): ExcelJS.CellValue {
  let valor: ExcelJS.CellValue = null;
  const esFecha = celda.idEstilo ? contexto.estiloEsFecha(celda.idEstilo) : false;
  const textoValor = typeof celda.valor === "string" ? celda.valor : undefined;

  if (celda.formula || celda.compartida) {
    let resultado: ExcelJS.CellValue | undefined;
    if (celda.valor) {
      if (celda.tipo === "str") resultado = xmlDecode(textoValor ?? "");
      else if (celda.tipo === "b") resultado = parseInt(textoValor ?? "", 10) !== 0;
      else if (celda.tipo === "e") resultado = { error: (textoValor ?? "") as ExcelJS.CellErrorValue["error"] };
      else resultado = parseFloat(textoValor ?? "");
    }
    if (resultado !== undefined && esFecha && typeof resultado === "number") {
      resultado = excelToDate(resultado, contexto.date1904);
    }
    if (contexto.hipervinculos.has(celda.direccion)) {
      return { text: resultado as string, hyperlink: "" };
    }
    return { formula: celda.formula ?? "", result: resultado } as ExcelJS.CellFormulaValue;
  }

  if (celda.valor !== undefined) {
    switch (celda.tipo) {
      case "s": {
        const texto = contexto.textos[parseInt(textoValor ?? "", 10)];
        if (texto === undefined) throw new HojaXlsxInvalidaError("referencia a un texto compartido inexistente");
        valor = texto as ExcelJS.CellValue;
        break;
      }
      case "str":
        valor = xmlDecode(textoValor ?? "");
        break;
      case "inlineStr":
        valor = celda.valor as ExcelJS.CellValue;
        break;
      case "b":
        valor = parseInt(textoValor ?? "", 10) !== 0;
        break;
      case "e":
        valor = { error: (textoValor ?? "") as ExcelJS.CellErrorValue["error"] };
        break;
      default: {
        const numero = parseFloat(textoValor ?? "");
        valor = esFecha ? excelToDate(numero, contexto.date1904) : numero;
      }
    }
  }

  if (contexto.hipervinculos.has(celda.direccion)) {
    return { text: valor as string, hyperlink: "" };
  }

  return valor;
}

type FilaCruda = { numeroFila: number; crudos: ExcelJS.CellValue[] };

// Recorre `<sheetData>` y entrega cada `<row>` con sus valores crudos, como `xlsx.load`.
async function* recorrerFilasCrudas(
  entrada: Readable,
  contexto: ContextoCeldas,
  maximoColumnas: number,
): AsyncGenerator<FilaCruda> {
  let enDatos = false;
  let fila: FilaCruda | null = null;
  let celda: CeldaEnLectura | null = null;
  let columnaAnterior = 0;
  let ultimaFilaLeida = 0;

  for await (const eventos of parseSax(entrada)) {
    for (const evento of eventos) {
      if (evento.eventType === "opentag") {
        const { name: nombre, attributes: atributos } = evento.value;

        if (celda?.fragmento) {
          if (nombre === "t") celda.textoFragmento = [];
          continue;
        }

        switch (nombre) {
          case "sheetData":
            enDatos = true;
            break;
          case "row":
            if (enDatos) {
              ultimaFilaLeida = numeroFilaValidado(atributos.r, ultimaFilaLeida);
              fila = { numeroFila: ultimaFilaLeida, crudos: [] };
              columnaAnterior = 0;
            }
            break;
          case "c":
            if (fila) {
              celda = {
                direccion: atributos.r ?? "",
                tipo: atributos.t,
                idEstilo: atributos.s ? parseInt(atributos.s, 10) : undefined,
                formula: undefined,
                compartida: undefined,
                valor: undefined,
                nodoActual: undefined,
                fragmento: null,
                textoFragmento: null,
              };
            }
            break;
          case "f":
            if (celda) {
              celda.nodoActual = "f";
              celda.compartida = atributos.t;
            }
            break;
          case "v":
            if (celda) celda.nodoActual = "v";
            break;
          case "t":
            if (celda) celda.nodoActual = "t";
            break;
          case "r":
            if (celda) celda.fragmento = {};
            break;
          default:
            break;
        }
        continue;
      }

      if (evento.eventType === "text") {
        if (!celda) continue;
        if (celda.fragmento) {
          celda.textoFragmento?.push(evento.value);
          continue;
        }
        if (celda.nodoActual === "f") {
          celda.formula = celda.formula ? celda.formula + evento.value : evento.value;
        } else if (celda.nodoActual === "v" || celda.nodoActual === "t") {
          // En memoria, un texto que llega después de fragmentos enriquecidos no altera el valor.
          if (typeof celda.valor === "object") continue;
          celda.valor = celda.valor ? celda.valor + evento.value : evento.value;
        }
        continue;
      }

      const nombre = evento.value.name;

      if (celda?.fragmento) {
        if (nombre === "t" && celda.textoFragmento) {
          celda.fragmento.text = decodificarEscapes(celda.textoFragmento.join(""));
          celda.textoFragmento = null;
        } else if (nombre === "r") {
          if (typeof celda.valor !== "string") {
            celda.valor ??= { richText: [] };
            celda.valor.richText.push(celda.fragmento);
          }
          celda.fragmento = null;
          celda.nodoActual = undefined;
        }
        continue;
      }

      switch (nombre) {
        case "sheetData":
          enDatos = false;
          break;
        case "f":
        case "v":
        case "is":
        case "t":
          if (celda) celda.nodoActual = undefined;
          break;
        case "c":
          if (fila && celda) {
            // Una celda sin `r` (válido en el estándar) ocupa la columna siguiente.
            const columna = celda.direccion ? colCache.decodeAddress(celda.direccion).col : columnaAnterior + 1;
            columnaAnterior = columna;
            if (!celda.direccion) celda.direccion = `${letraColumna(columna)}${fila.numeroFila}`;
            if (columna <= maximoColumnas) {
              const valor = valorDeCelda(celda, contexto);
              if (valor !== null && valor !== undefined) fila.crudos[columna - 1] = valor;
            }
          }
          celda = null;
          break;
        case "row":
          if (fila) {
            yield fila;
            fila = null;
          }
          break;
        default:
          break;
      }
    }
  }
}

function letraColumna(indice: number): string {
  let resultado = "";
  let numero = indice;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    numero = Math.floor((numero - 1) / 26);
  }
  return resultado;
}

type RangoCombinado = { top: number; left: number; bottom: number; right: number };

type ResultadoPrimeraPasada = { rangos: RangoCombinado[]; hipervinculos: Set<string> };

// Primera pasada (RF-38): `<mergeCells>` e `<hyperlinks>` vienen DESPUÉS de `<sheetData>`. Solo se
// descomprime y se escanea la hoja, sin interpretar celdas. Los hipervínculos solo cuentan si tienen
// relación externa con destino (igual que `WorksheetXform.reconcile`).
async function primeraPasada(
  entrada: Readable,
  relaciones: ReadonlyMap<string, string>,
  conHipervinculos: boolean,
): Promise<ResultadoPrimeraPasada> {
  const rangos: RangoCombinado[] = [];
  const hipervinculos = new Set<string>();

  for await (const eventos of parseSax(entrada)) {
    for (const evento of eventos) {
      if (evento.eventType !== "opentag") continue;
      const { name: nombre, attributes: atributos } = evento.value;

      if (nombre === "mergeCell" && atributos.ref) {
        if (rangos.length >= TOPE_RANGOS_COMBINADOS) throw new HojaXlsxInvalidaError("demasiados rangos combinados");
        const rango = colCache.decode(atributos.ref);
        rangos.push(
          "top" in rango
            ? { top: rango.top, left: rango.left, bottom: rango.bottom, right: rango.right }
            : { top: rango.row, left: rango.col, bottom: rango.row, right: rango.col },
        );
      } else if (conHipervinculos && nombre === "hyperlink" && atributos.ref) {
        const idRelacion = atributos["r:id"];
        if (!idRelacion) continue;
        const destino = relaciones.get(idRelacion);
        // En memoria, una relación inexistente hace fallar la lectura completa.
        if (destino === undefined) throw new HojaXlsxInvalidaError("hipervínculo sin relación");
        if (!destino) continue;
        if (hipervinculos.size >= TOPE_HIPERVINCULOS) throw new HojaXlsxInvalidaError("demasiados hipervínculos");
        hipervinculos.add(atributos.ref);
      }
    }
  }

  return { rangos, hipervinculos };
}

async function leerRelacionesHoja(entrada: Readable): Promise<Map<string, string>> {
  const relaciones = new Map<string, string>();
  for await (const eventos of parseSax(entrada)) {
    for (const evento of eventos) {
      if (evento.eventType === "opentag" && evento.value.name === "Relationship") {
        relaciones.set(evento.value.attributes.Id ?? "", evento.value.attributes.Target ?? "");
      }
    }
  }
  return relaciones;
}

// Valida que los rangos no se solapen (en memoria, `mergeCells` lanza) y los ordena por fila.
function prepararRangos(rangos: RangoCombinado[]): RangoCombinado[] {
  const ordenados = [...rangos].sort((a, b) => a.top - b.top || a.left - b.left);
  const activos: RangoCombinado[] = [];

  for (const rango of ordenados) {
    for (let indice = activos.length - 1; indice >= 0; indice -= 1) {
      if (activos[indice].bottom < rango.top) activos.splice(indice, 1);
    }
    for (const otro of activos) {
      if (otro.left <= rango.right && rango.left <= otro.right) {
        throw new HojaXlsxInvalidaError("rangos combinados que se solapan");
      }
    }
    activos.push(rango);
  }

  return ordenados;
}

// Aplica los rangos combinados sobre las filas en orden: cada secundaria toma el valor de la
// principal (aunque traiga uno propio), y las filas cubiertas por un rango que el archivo no trae
// se generan, igual que `Worksheet.mergeCells` al cargar.
async function* aplicarCombinadas(
  filas: AsyncIterable<FilaCruda>,
  rangosOrdenados: RangoCombinado[],
  maximoColumnas: number,
): AsyncGenerator<FilaCruda> {
  if (rangosOrdenados.length === 0) {
    yield* filas;
    return;
  }

  const valoresPrincipales = new Map<RangoCombinado, ExcelJS.CellValue>();
  let siguienteRango = 0;
  let activos: RangoCombinado[] = [];
  let ultimaFila = 0;

  function activarHasta(numeroFila: number): void {
    while (siguienteRango < rangosOrdenados.length && rangosOrdenados[siguienteRango].top <= numeroFila) {
      activos.push(rangosOrdenados[siguienteRango]);
      siguienteRango += 1;
    }
    activos = activos.filter((rango) => rango.bottom >= numeroFila);
  }

  function rellenar(fila: FilaCruda): void {
    activarHasta(fila.numeroFila);
    for (const rango of activos) {
      if (rango.top === fila.numeroFila) valoresPrincipales.set(rango, fila.crudos[rango.left - 1] ?? null);
      const principal = valoresPrincipales.get(rango) ?? null;
      const derecha = Math.min(rango.right, maximoColumnas);
      for (let columna = rango.left; columna <= derecha; columna += 1) {
        if (fila.numeroFila === rango.top && columna === rango.left) continue;
        if (principal === null || principal === undefined) delete fila.crudos[columna - 1];
        else fila.crudos[columna - 1] = principal;
      }
    }
    for (const rango of [...valoresPrincipales.keys()]) {
      if (rango.bottom <= fila.numeroFila) valoresPrincipales.delete(rango);
    }
  }

  // Filas sin `<row>` entre `desde` y `hasta` (inclusive) que algún rango cubre.
  function* filasGeneradas(desde: number, hasta: number): Generator<FilaCruda> {
    let numeroFila = desde;
    while (numeroFila <= hasta) {
      activarHasta(numeroFila);
      if (activos.length === 0) {
        const proximo = rangosOrdenados[siguienteRango];
        if (!proximo || proximo.top > hasta) return;
        numeroFila = Math.max(numeroFila + 1, proximo.top);
        continue;
      }
      const generada: FilaCruda = { numeroFila, crudos: [] };
      rellenar(generada);
      yield generada;
      numeroFila += 1;
    }
  }

  for await (const fila of filas) {
    yield* filasGeneradas(ultimaFila + 1, fila.numeroFila - 1);
    rellenar(fila);
    ultimaFila = fila.numeroFila;
    yield fila;
  }

  const ultimaCubierta = rangosOrdenados.reduce((maximo, rango) => Math.max(maximo, rango.bottom), 0);
  yield* filasGeneradas(ultimaFila + 1, ultimaCubierta);
}

function aValores(crudos: ExcelJS.CellValue[]): ValorCeldaPrimitivo[] {
  const valores: ValorCeldaPrimitivo[] = [];
  for (let indice = 0; indice < crudos.length; indice += 1) valores.push(celdaAValor(crudos[indice]));
  return valores;
}

// RF-37: ÚNICO punto de lectura en streaming de archivos .xlsx con exceljs (mismo criterio que
// `abrirHojaExcelJs.ts` para la lectura en memoria). Recorre solo la PRIMERA hoja del libro y nunca
// carga el libro completo en memoria. Lanza si el archivo no es un ZIP/xlsx válido, o
// `ParteXlsxDemasiadoGrandeError` si una parte retenida en memoria supera el tope descomprimido.
export async function* recorrerFilasPrimeraHojaXlsx(
  origen: FuenteXlsx,
  opciones: OpcionesLecturaXlsx = {},
): AsyncGenerator<FilaHojaStreaming> {
  const { fuente, abrirEntrada, cerrar } = crearFuenteRastreada(origen);
  const tope = opciones.topeBytesParte ?? TOPE_BYTES_PARTE_XLSX;
  const fiel = opciones.celdasComoLecturaEnMemoria === true;
  const maximoColumnas = opciones.maximoColumnas ?? MAXIMO_COLUMNAS_HOJA;
  const rutaReferencia = typeof origen === "string" ? origen : "ruta" in origen ? origen.ruta : "memoria.xlsx";

  try {
    const directorio = await Open.custom(fuente);
    const buscar = (rutaEntrada: string) => directorio.files.find((entrada) => entrada.path === rutaEntrada);
    const lector = new ExcelJS.stream.xlsx.WorkbookReader(rutaReferencia, OPCIONES_LECTOR) as unknown as LectorLibroInterno;

    const relaciones = buscar("xl/_rels/workbook.xml.rels");
    if (relaciones) await lector._parseRels(abrirEntrada(relaciones, tope));

    const libro = buscar("xl/workbook.xml");
    if (libro) await lector._parseWorkbook(abrirEntrada(libro, tope));

    const estilos = buscar("xl/styles.xml");
    if (estilos) await lector._parseStyles(abrirEntrada(estilos, tope));

    const textos = buscar("xl/sharedStrings.xml");
    let textosCompartidos: TextoCompartido[] = [];
    if (textos) {
      if (fiel) textosCompartidos = await leerTextosCompartidos(abrirEntrada(textos, tope));
      else await consumir(lector._parseSharedStrings(abrirEntrada(textos, tope)));
    }

    const rutaHoja = rutaPrimeraHoja(lector);
    const hoja = buscar(rutaHoja);
    if (!hoja) return;

    const conCombinadas = opciones.aplicarCeldasCombinadas === true;

    if (!fiel && !conCombinadas) {
      const numeroHoja = /sheet(\d+)\.xml$/.exec(rutaHoja)?.[1] ?? "1";
      let ultimaFilaLeida = 0;
      for (const evento of lector._parseWorksheet(abrirEntrada(hoja, opciones.topeBytesHoja), numeroHoja)) {
        if (evento.eventType !== "worksheet") continue;
        for await (const fila of evento.value) {
          ultimaFilaLeida = numeroFilaValidado(fila.number, ultimaFilaLeida);
          yield { numeroFila: ultimaFilaLeida, valores: valoresDeFila(fila) };
        }
      }
      return;
    }

    let relacionesHoja = new Map<string, string>();
    if (fiel) {
      const entradaRelaciones = buscar(rutaRelacionesHoja(rutaHoja));
      if (entradaRelaciones) relacionesHoja = await leerRelacionesHoja(abrirEntrada(entradaRelaciones, tope));
    }

    const { rangos, hipervinculos } = await primeraPasada(abrirEntrada(hoja, opciones.topeBytesHoja), relacionesHoja, fiel);
    const rangosOrdenados = conCombinadas ? prepararRangos(rangos) : [];

    const contexto: ContextoCeldas = {
      textos: textosCompartidos,
      date1904: lector.properties?.model?.date1904 === true,
      estiloEsFecha: (idEstilo) => isDateFmt(lector.styles?.getStyleModel(idEstilo)?.numFmt),
      hipervinculos,
    };

    const filasCrudas = fiel
      ? recorrerFilasCrudas(abrirEntrada(hoja, opciones.topeBytesHoja), contexto, maximoColumnas)
      : filasCrudasExcelJs(lector, hoja, rutaHoja, abrirEntrada, opciones.topeBytesHoja);

    for await (const fila of aplicarCombinadas(filasCrudas, rangosOrdenados, maximoColumnas)) {
      yield fiel
        ? { numeroFila: fila.numeroFila, valores: aValores(fila.crudos), crudos: fila.crudos }
        : { numeroFila: fila.numeroFila, valores: aValores(fila.crudos) };
    }
  } finally {
    cerrar();
  }
}

// Filas crudas del lector en streaming de exceljs (solo con `aplicarCeldasCombinadas` sin
// `celdasComoLecturaEnMemoria`).
async function* filasCrudasExcelJs(
  lector: LectorLibroInterno,
  hoja: EntradaZip,
  rutaHoja: string,
  abrirEntrada: FuenteRastreada["abrirEntrada"],
  topeBytesHoja: number | undefined,
): AsyncGenerator<FilaCruda> {
  const numeroHoja = /sheet(\d+)\.xml$/.exec(rutaHoja)?.[1] ?? "1";
  let ultimaFilaLeida = 0;
  for (const evento of lector._parseWorksheet(abrirEntrada(hoja, topeBytesHoja), numeroHoja)) {
    if (evento.eventType !== "worksheet") continue;
    for await (const fila of evento.value) {
      ultimaFilaLeida = numeroFilaValidado(fila.number, ultimaFilaLeida);
      const crudos = (fila.values as ExcelJS.CellValue[]).slice(1);
      yield { numeroFila: ultimaFilaLeida, crudos };
    }
  }
}
