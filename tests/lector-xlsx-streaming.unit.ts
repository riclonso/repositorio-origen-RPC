// RF-37: contrato del lector streaming de xlsx (`leerHojaStreamingExcelJs.ts`), que usa métodos
// INTERNOS de exceljs (`_parseRels`, `_parseWorkbook`, `_parseStyles`, `_parseSharedStrings`,
// `_parseWorksheet`) y `unzipper`, ambos con versión exacta fijada en package.json. Si una
// actualización cambia esa API interna, esta prueba debe fallar: genera un xlsx de referencia con
// textos compartidos y estilos, y verifica encabezados, filas, tipos y número de fila real. Cubre
// además el tope de bytes descomprimidos por parte (bomba ZIP), tanto por tamaño declarado como por
// tamaño REAL con el declarado falseado. Sin base de datos ni variables de entorno.
//
//   npx tsx tests/lector-xlsx-streaming.unit.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  ParteXlsxDemasiadoGrandeError,
  recorrerFilasPrimeraHojaXlsx,
  type FilaHojaStreaming,
} from "../src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";

let fallos = 0;
let ejecutadas = 0;

async function prueba(nombre: string, cuerpo: () => void | Promise<void>): Promise<void> {
  ejecutadas += 1;
  try {
    await cuerpo();
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`FALLA ${nombre}`);
    console.error(error);
  }
}

async function recolectar(filas: AsyncIterable<FilaHojaStreaming>): Promise<FilaHojaStreaming[]> {
  const resultado: FilaHojaStreaming[] = [];
  for await (const fila of filas) resultado.push(fila);
  return resultado;
}

const FIRMA_DIRECTORIO_CENTRAL = 0x02014b50;
const PARTE_TEXTOS = "xl/sharedStrings.xml";

// Ubica en el directorio central la entrada `rutaParte` y devuelve el desplazamiento de su campo
// "uncompressed size" (offset 24 de la cabecera, 4 bytes little-endian).
function desplazamientoTamanoDescomprimido(zip: Buffer, rutaParte: string): number {
  for (let posicion = 0; posicion + 46 <= zip.length; posicion += 1) {
    if (zip.readUInt32LE(posicion) !== FIRMA_DIRECTORIO_CENTRAL) continue;
    const largoNombre = zip.readUInt16LE(posicion + 28);
    const nombre = zip.toString("utf8", posicion + 46, posicion + 46 + largoNombre);
    if (nombre === rutaParte) return posicion + 24;
  }
  throw new Error(`No se encontró ${rutaParte} en el directorio central`);
}

async function main(): Promise<void> {
  const directorio = await mkdtemp(path.join(tmpdir(), "lector-xlsx-"));

  try {
    // --- Libro de referencia: textos repetidos (tabla de textos compartidos), estilos (fecha con
    // formato, negrita, número con formato), booleano, fila vacía intermedia y una segunda hoja.
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Datos");
    hoja.addRow(["Nombre", "Fecha", "Monto", "Activo"]);
    hoja.getRow(1).font = { bold: true };
    hoja.addRow(["Ana", new Date(Date.UTC(2024, 0, 15)), 1234.5, true]);
    hoja.addRow(["Ana", new Date(Date.UTC(2024, 11, 31)), 0, false]);
    hoja.addRow([]);
    hoja.addRow(["Bernardo Ñuñez", null, -7, true]);
    hoja.getColumn(2).numFmt = "dd/mm/yyyy";
    hoja.getColumn(3).numFmt = "#,##0.00";
    for (let indice = 0; indice < 200; indice += 1) hoja.addRow([`texto compartido número ${indice}`, null, indice, false]);
    libro.addWorksheet("Otra").addRow(["no", "se", "lee", "nunca"]);

    const contenido = Buffer.from(await libro.xlsx.writeBuffer());
    const rutaReferencia = path.join(directorio, "referencia.xlsx");
    await writeFile(rutaReferencia, contenido);

    await prueba("el libro de referencia trae textos compartidos y estilos", () => {
      // Si exceljs dejara de escribirlos, el resto de las pruebas no cubriría esas partes.
      assert.doesNotThrow(() => desplazamientoTamanoDescomprimido(contenido, PARTE_TEXTOS));
      assert.doesNotThrow(() => desplazamientoTamanoDescomprimido(contenido, "xl/styles.xml"));
    });

    await prueba("encabezados y filas: textos compartidos resueltos, fechas, números, booleanos", async () => {
      const filas = await recolectar(recorrerFilasPrimeraHojaXlsx(rutaReferencia));

      assert.deepEqual(filas[0], { numeroFila: 1, valores: ["Nombre", "Fecha", "Monto", "Activo"] });

      const [, primera, segunda, tercera] = filas;
      assert.equal(primera?.numeroFila, 2);
      assert.equal(primera?.valores[0], "Ana");
      assert.ok(primera?.valores[1] instanceof Date, "la fecha con formato debe llegar como Date (estilos)");
      assert.equal((primera?.valores[1] as Date).toISOString(), "2024-01-15T00:00:00.000Z");
      assert.equal(primera?.valores[2], 1234.5);
      assert.equal(primera?.valores[3], true);

      assert.equal(segunda?.valores[0], "Ana");
      assert.equal((segunda?.valores[1] as Date).toISOString(), "2024-12-31T00:00:00.000Z");
      assert.equal(segunda?.valores[2], 0);
      assert.equal(segunda?.valores[3], false);

      // La fila 4 está vacía: no se emite y la siguiente conserva su número real.
      assert.equal(tercera?.numeroFila, 5);
      assert.deepEqual(tercera?.valores, ["Bernardo Ñuñez", null, -7, true]);

      assert.equal(filas.length, 4 + 200);
      assert.equal(filas.at(-1)?.valores[0], "texto compartido número 199");
      // Nunca un objeto `{ sharedString: n }` sin resolver ni contenido de la segunda hoja.
      assert.ok(filas.every((fila) => typeof fila.valores[0] === "string"));
      assert.ok(filas.every((fila) => !fila.valores.includes("nunca")));
    });

    await prueba("cortar la iteración libera el archivo (se puede borrar en Windows)", async () => {
      const copia = path.join(directorio, "copia.xlsx");
      await writeFile(copia, contenido);
      for await (const fila of recorrerFilasPrimeraHojaXlsx(copia)) {
        assert.equal(fila.numeroFila, 1);
        break;
      }
      await rm(copia);
    });

    // --- Tope por parte (bomba ZIP).
    const tamanoRealTextos = contenido.readUInt32LE(desplazamientoTamanoDescomprimido(contenido, PARTE_TEXTOS));

    await prueba("tope: rechaza una parte cuyo tamaño DECLARADO lo excede", async () => {
      await assert.rejects(
        () => recolectar(recorrerFilasPrimeraHojaXlsx(rutaReferencia, { topeBytesParte: tamanoRealTextos - 1 })),
        (error: unknown) => error instanceof ParteXlsxDemasiadoGrandeError,
      );
    });

    await prueba("tope: con el tamaño declarado FALSEADO, corta al medir los bytes reales", async () => {
      const falseado = Buffer.from(contenido);
      falseado.writeUInt32LE(10, desplazamientoTamanoDescomprimido(falseado, PARTE_TEXTOS));
      const rutaFalseada = path.join(directorio, "falseado.xlsx");
      await writeFile(rutaFalseada, falseado);

      // El declarado (10) pasa el tope; el real no.
      await assert.rejects(
        () => recolectar(recorrerFilasPrimeraHojaXlsx(rutaFalseada, { topeBytesParte: tamanoRealTextos - 1 })),
        (error: unknown) => error instanceof ParteXlsxDemasiadoGrandeError,
      );
      // Y el descriptor quedó cerrado tras el corte.
      await rm(rutaFalseada);
    });

    await prueba("tope: justo en el tamaño real se lee normalmente", async () => {
      const filas = await recolectar(recorrerFilasPrimeraHojaXlsx(rutaReferencia, { topeBytesParte: tamanoRealTextos }));
      assert.equal(filas.length, 4 + 200);
    });

    await prueba("un archivo que no es ZIP lanza (se traduce a ARCHIVO_ILEGIBLE aguas arriba)", async () => {
      const rutaCorrupta = path.join(directorio, "corrupto.xlsx");
      await writeFile(rutaCorrupta, Buffer.concat([(await readFile(rutaReferencia)).subarray(0, 40), Buffer.alloc(40)]));
      await assert.rejects(() => recolectar(recorrerFilasPrimeraHojaXlsx(rutaCorrupta)));
    });
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
