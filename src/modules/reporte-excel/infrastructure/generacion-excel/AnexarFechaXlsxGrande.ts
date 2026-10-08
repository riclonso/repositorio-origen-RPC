import { Readable } from "node:stream";
import path from "node:path";
import archiver from "archiver";
import parseSax from "exceljs/lib/utils/parse-sax";
import { Open } from "unzipper";
import { flujoWebDesdeNode } from "@/infrastructure/hojas-calculo/flujoWebDesdeNode";
import { crearFuenteRastreada, recorrerFilasPrimeraHojaXlsx, type FuenteXlsx } from "@/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";
import { TOPE_BYTES_HOJA_CARGA } from "@/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
import { formatearFechaHoraSegundosChile, instanteAParedChile } from "@/shared/utils/fecha";

const UMBRAL_XLSX_GRANDE = 50 * 1024 * 1024;
const MAXIMO_BUFFER_XML = 32 * 1024 * 1024;

function anexarEstiloFecha(xml: string): { xml: string; indice: number } | null {
  const xfs = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!xfs) return null;
  const indice = [...xfs[2].matchAll(/<xf(?=[\s/>])/g)].length;
  if (!indice || indice >= 65_000) return null;
  const ids = [...xml.matchAll(/\bnumFmtId=["'](\d+)["']/g)].map(match => Number(match[1]));
  const id = Math.max(163, ...ids) + 1;
  const formato = `<numFmt numFmtId="${id}" formatCode="dd-mm-yyyy hh:mm"/>`;
  const formatos = /<numFmts\b([^>]*)(?:\/>|>([\s\S]*?)<\/numFmts>)/.exec(xml);
  if (formatos) {
    const contenido = formatos[2] ?? "";
    const cantidad = [...contenido.matchAll(/<numFmt(?=[\s/>])/g)].length + 1;
    xml = xml.replace(formatos[0], () => `<numFmts count="${cantidad}">${contenido}${formato}</numFmts>`);
  } else {
    if (!/<fonts(?=[\s>])/.test(xml)) return null;
    xml = xml.replace(/<fonts(?=[\s>])/, `<numFmts count="1">${formato}</numFmts><fonts`);
  }
  const atributos = xfs[1].replace(/\s+count=["']\d+["']/, "");
  const xf = `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`;
  xml = xml.replace(xfs[0], () => `<cellXfs${atributos} count="${indice + 1}">${xfs[2]}${xf}</cellXfs>`);
  return { xml, indice };
}

function columna(indice: number): string {
  let nombre = "";
  while (indice > 0) {
    indice -= 1;
    nombre = String.fromCharCode(65 + indice % 26) + nombre;
    indice = Math.floor(indice / 26);
  }
  return nombre;
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function finEtiqueta(xml: string, inicio: number): number {
  let comilla = "";
  for (let i = inicio; i < xml.length; i += 1) {
    const caracter = xml[i];
    if (comilla) { if (caracter === comilla) comilla = ""; }
    else if (caracter === '"' || caracter === "'") comilla = caracter;
    else if (caracter === ">") return i + 1;
  }
  return -1;
}

// Conserva las celdas originales sin crear objetos por celda. Solo retiene una fila y respeta
// comentarios, CDATA y declaraciones, que pueden contener un texto como "</row>".
export async function* anexarColumnaXml(
  origen: AsyncIterable<string>,
  nuevaColumna: string,
  encabezado: string,
  fecha: string,
  signal?: AbortSignal,
  formatoFecha?: { indice: number; numero: number },
): AsyncGenerator<string> {
  let buffer = "";
  let cursor = 0;
  let enFila = false;
  let numeroFila = 0;
  let antesDatos = true;
  let bytes = 0;
  const marcas = /<row(?=[\s/>])|<\/row\s*>|<!--|<!\[CDATA\[|<\?/g;
  const indiceColumna = [...nuevaColumna].reduce((indice, letra) => indice * 26 + letra.charCodeAt(0) - 64, 0);
  const celda = (fila: number) => fila !== 1 && formatoFecha
    ? `<c r="${nuevaColumna}${fila}" s="${formatoFecha.indice}"><v>${formatoFecha.numero}</v></c>`
    : `<c r="${nuevaColumna}${fila}" t="inlineStr"><is><t>${escapar(fila === 1 ? encabezado : fecha)}</t></is></c>`;

  for await (const trozo of origen) {
    signal?.throwIfAborted();
    bytes += Buffer.byteLength(trozo);
    if (bytes > TOPE_BYTES_HOJA_CARGA) throw new Error("La hoja excede el tamaño permitido");
    buffer += trozo;
    for (;;) {
      marcas.lastIndex = cursor;
      const marca = marcas.exec(buffer);
      if (!marca) {
        if (!enFila && !antesDatos) {
          const hasta = Math.max(cursor, buffer.length - 16);
          yield buffer.slice(0, hasta);
          buffer = buffer.slice(hasta);
          cursor = 0;
        }
        break;
      }
      const inicio = marca.index;
      if (marca[0] === "<!--" || marca[0] === "<![CDATA[" || marca[0] === "<?") {
        const cierre = marca[0] === "<!--" ? "-->" : marca[0] === "<?" ? "?>" : "]]>";
        const fin = buffer.indexOf(cierre, inicio + marca[0].length);
        if (fin === -1) { cursor = inicio; break; }
        cursor = fin + cierre.length;
        continue;
      }
      if (marca[0].startsWith("</row")) {
        if (!enFila) throw new Error("Fila XML inválida");
        const fin = inicio + marca[0].length;
        yield buffer.slice(0, inicio) + celda(numeroFila) + buffer.slice(inicio, fin);
        buffer = buffer.slice(fin);
        cursor = 0;
        enFila = false;
        continue;
      }
      const fin = finEtiqueta(buffer, inicio);
      if (fin === -1) { cursor = inicio; break; }
      if (enFila) throw new Error("Fila XML anidada");
      const etiqueta = buffer.slice(inicio, fin).replace(/(\sspans=["'])(\d+):(\d+)(["'])/, (_, prefijo: string, desde: string, hasta: string, comilla: string) => `${prefijo}${Math.min(Number(desde), indiceColumna)}:${Math.max(Number(hasta), indiceColumna)}${comilla}`);
      const r = /\sr\s*=\s*(["'])(\d+)\1/.exec(etiqueta);
      const siguiente = r ? Number(r[2]) : numeroFila + 1;
      if (!Number.isSafeInteger(siguiente) || siguiente <= numeroFila || siguiente > 1_048_576) throw new Error("Número de fila inválido");
      numeroFila = siguiente;
      let prefijo = buffer.slice(0, inicio);
      if (antesDatos) {
        prefijo = prefijo.replace(/(<dimension\b[^>]*\bref\s*=\s*["'])([A-Z]+\d+):[A-Z]+(\d+)(["'])/, `$1$2:${nuevaColumna}$3$4`);
        antesDatos = false;
      }
      yield prefijo;
      buffer = etiqueta + buffer.slice(fin);
      cursor = etiqueta.length;
      if (/\/\s*>$/.test(etiqueta)) {
        yield etiqueta.replace(/\/\s*>$/, ">") + celda(numeroFila) + "</row>";
        buffer = buffer.slice(cursor);
        cursor = 0;
      } else enFila = true;
    }
    if (buffer.length > MAXIMO_BUFFER_XML) throw new Error("Fila XML demasiado grande");
  }
  signal?.throwIfAborted();
  if (enFila || antesDatos) throw new Error("Hoja XML incompleta");
  yield buffer;
}

// Camino rápido para libros grandes con texto inline, como RBB 2017. Conserva
// el resto del ZIP; no recorre toda la hoja para combinadas ni reconstruye millones de celdas.
// Los demás libros mantienen el generador existente y su contrato.
export async function generarXlsxGrande(
  fuente: FuenteXlsx,
  fecha: Date,
  nombreEncabezado: (encabezados: string[]) => string,
  signal?: AbortSignal,
  umbralBytes = UMBRAL_XLSX_GRANDE,
): Promise<ReadableStream<Uint8Array> | null> {
  const rastreada = crearFuenteRastreada(fuente, signal);
  const lecturas: Readable[] = [];
  const cerrar = (error?: Error) => {
    rastreada.cerrar(error);
    for (const lectura of lecturas) lectura.destroy(error);
  };
  const cancelarPreparacion = () => cerrar(new Error("Preparación cancelada"));
  signal?.addEventListener("abort", cancelarPreparacion, { once: true });
  let entregado = false;
  try {
    if (await rastreada.fuente.size() < umbralBytes) return null;
    const directorio = await Open.custom(rastreada.fuente);
    if (directorio.files.some((parte) => parte.path === "xl/sharedStrings.xml")) return null;
    const abrir = (parte: (typeof directorio.files)[number]) => {
      signal?.throwIfAborted();
      const lectura = parte.stream();
      lectura.on("error", () => undefined);
      lecturas.push(lectura);
      return lectura;
    };
    const libro = directorio.files.find(parte => parte.path === "xl/workbook.xml");
    const relaciones = directorio.files.find(parte => parte.path === "xl/_rels/workbook.xml.rels");
    if (!libro || !relaciones || libro.uncompressedSize > 1024 * 1024 || relaciones.uncompressedSize > 1024 * 1024) return null;
    let idHoja = "";
    let date1904 = false;
    for await (const eventos of parseSax(abrir(libro).setEncoding("utf8"))) {
      for (const evento of eventos) {
        if (evento.eventType === "opentag" && evento.value.name === "sheet" && !idHoja) idHoja = evento.value.attributes["r:id"];
        if (evento.eventType === "opentag" && evento.value.name === "workbookPr") date1904 = ["1", "true"].includes(evento.value.attributes.date1904);
      }
    }
    let rutaHoja = "";
    for await (const eventos of parseSax(abrir(relaciones).setEncoding("utf8"))) {
      for (const evento of eventos) {
        if (evento.eventType !== "opentag" || evento.value.name !== "Relationship") continue;
        const atributos = evento.value.attributes;
        if (atributos.Id === idHoja && atributos.Type?.endsWith("/worksheet") && atributos.Target) {
          rutaHoja = atributos.Target.startsWith("/") ? atributos.Target.slice(1) : path.posix.normalize(path.posix.join("xl", atributos.Target));
        }
      }
    }
    const hoja = directorio.files.find(parte => parte.path === rutaHoja);
    if (!hoja || hoja.uncompressedSize > TOPE_BYTES_HOJA_CARGA || directorio.files.some((parte) => parte !== hoja && parte.uncompressedSize > 256 * 1024 * 1024)) return null;
    let prefijo = "";
    for await (const trozo of abrir(hoja).setEncoding("utf8")) {
      prefijo += trozo;
      if (prefijo.includes("<sheetData>")) break;
      if (prefijo.length > 1024 * 1024) return null;
    }
    const dimension = /<dimension\b[^>]*\bref\s*=\s*(["'])A1:([A-Z]+)(\d+)\1/.exec(prefijo);
    if (!dimension || !/<worksheet(?:\s|>)/.test(prefijo)) return null;
    const filas = recorrerFilasPrimeraHojaXlsx(fuente, { signal, topeBytesHoja: TOPE_BYTES_HOJA_CARGA });
    let encabezados: string[];
    try {
      const primera = await filas.next();
      if (primera.done || primera.value.numeroFila !== 1) return null;
      encabezados = [];
      for (const valor of primera.value.valores) {
        const texto = String(valor ?? "").trim();
        if (!texto) break;
        encabezados.push(texto);
      }
    } finally { await filas.return(undefined); }
    if (!encabezados.length || encabezados.length > 500 || columna(encabezados.length) !== dimension[2]) return null;
    const parteEstilos = directorio.files.find(parte => parte.path === "xl/styles.xml");
    if (!parteEstilos || parteEstilos.uncompressedSize > 1024 * 1024) return null;
    let estilosXml = "";
    for await (const trozo of abrir(parteEstilos).setEncoding("utf8")) {
      estilosXml += trozo;
      if (estilosXml.length > 1024 * 1024) return null;
    }
    const estiloFecha = anexarEstiloFecha(estilosXml);
    if (!estiloFecha) return null;
    const numeroFecha = 25569 + instanteAParedChile(fecha).getTime() / 86_400_000 - (date1904 ? 1462 : 0);
    signal?.throwIfAborted();
    const archivo = archiver("zip", { zlib: { level: 1 } });
    let cerrado = false;
    const limpiar = () => {
      if (cerrado) return;
      cerrado = true;
      signal?.removeEventListener("abort", cancelar);
      cerrar();
      archivo.abort();
    };
    const fallar = (error: Error) => { limpiar(); archivo.destroy(error); };
    const cancelar = () => fallar(signal?.reason instanceof Error ? signal.reason : new Error("Descarga cancelada"));
    archivo.on("error", limpiar);
    archivo.on("warning", fallar);
    archivo.once("end", limpiar);
    archivo.once("close", limpiar);
    signal?.addEventListener("abort", cancelar, { once: true });
    const flujo = flujoWebDesdeNode(archivo);
    for (const parte of directorio.files) {
      if (parte.type !== "File") continue;
      const lectura = parte === parteEstilos ? Readable.from([estiloFecha.xml]) : abrir(parte);
      const entrada = parte === hoja
        ? Readable.from(anexarColumnaXml(lectura.setEncoding("utf8") as AsyncIterable<string>, columna(encabezados.length + 1), nombreEncabezado(encabezados), formatearFechaHoraSegundosChile(fecha), signal, { indice: estiloFecha.indice, numero: numeroFecha }))
        : lectura;
      entrada.on("error", fallar);
      lecturas.push(entrada);
      archivo.append(entrada, { name: parte.path });
    }
    void archivo.finalize().catch(fallar);
    entregado = true;
    return flujo;
  } finally {
    signal?.removeEventListener("abort", cancelarPreparacion);
    if (!entregado) cerrar();
  }
}
