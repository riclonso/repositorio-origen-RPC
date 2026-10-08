// RF-38: descarga con la columna "Fecha y hora de notificación". CSV (UTF-8 con y sin
// BOM, Windows-1252, comillas, `""`, CRLF/LF, sin salto final, colisión de nombre), xlsx (tipos, "="
// como texto, fechas, segunda hoja descartada, celdas fuera del encabezado, filas vacías sin fecha,
// combinadas, colisión "(sistema)", hora de Chile en verano e invierno), `fechaHoraNotificacion` y el
// `Content-Disposition` común. Sin base de datos.
//
//   npx tsx tests/descarga-carga.unit.ts
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { crearTransformAnexarColumnaCsv } from "../src/infrastructure/hojas-calculo/anexarColumnaCsv";
import { fechaHoraNotificacion } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import { encabezadoContentDisposition } from "../src/app/api/_lib/descarga";
import { formatearFechaHoraSegundosChile } from "../src/shared/utils/fecha";

// El generador registra errores con el logger, que importa `env.ts` (valida al importarse): se fijan
// valores ficticios (nunca usados para conectarse) y el módulo se carga con `import()` en `main()`.
process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

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

// 15-01-2025 13:04:05 en Chile (verano, UTC-3) y 15-07-2025 13:04:05 (invierno, UTC-4).
const VERANO = new Date("2025-01-15T16:04:05Z");
const INVIERNO = new Date("2025-07-15T17:04:05Z");

const NOMBRE_COLUMNA_NOTIFICACION = "Fecha y hora de notificación";
const NOMBRE_COLUMNA_NOTIFICACION_SISTEMA = "Fecha y hora de notificación (sistema)";

function nombreColumnaNotificacion(encabezados: string[]): string {
  const objetivo = NOMBRE_COLUMNA_NOTIFICACION.normalize("NFC").toLowerCase();
  return encabezados.some((encabezado) => encabezado.normalize("NFC").trim().toLowerCase() === objetivo)
    ? NOMBRE_COLUMNA_NOTIFICACION_SISTEMA
    : NOMBRE_COLUMNA_NOTIFICACION;
}

async function anexarCsv(entrada: Buffer, codificacion: "utf-8" | "windows-1252", trozo = 3): Promise<Buffer> {
  const partes: Buffer[] = [];
  for (let indice = 0; indice < entrada.length; indice += trozo) partes.push(entrada.subarray(indice, indice + trozo));
  const salida = Readable.from(partes).pipe(
    crearTransformAnexarColumnaCsv({ codificacion, nombreColumna: nombreColumnaNotificacion, valor: "15-01-2025 13:04:05" }),
  );
  const resultado: Buffer[] = [];
  for await (const parte of salida) resultado.push(parte as Buffer);
  return Buffer.concat(resultado);
}

async function leerXlsx(flujo: ReadableStream<Uint8Array>): Promise<ExcelJS.Worksheet> {
  const contenido = Buffer.from(await new Response(flujo).arrayBuffer());
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido as unknown as ArrayBuffer);
  return libro.worksheets[0];
}

async function main(): Promise<void> {
  const generacion = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const { crearGeneradorDescargaCargaExcelJs } = generacion;

  console.log("Dominio y formato");

  await prueba("el nombre de la columna del generador coincide con el de esta prueba", () => {
    assert.equal(generacion.NOMBRE_COLUMNA_NOTIFICACION, NOMBRE_COLUMNA_NOTIFICACION);
    assert.equal(generacion.NOMBRE_COLUMNA_NOTIFICACION_SISTEMA, NOMBRE_COLUMNA_NOTIFICACION_SISTEMA);
    assert.equal(generacion.nombreColumnaNotificacion([" FECHA Y HORA DE NOTIFICACIÓN "]), NOMBRE_COLUMNA_NOTIFICACION_SISTEMA);
  });

  await prueba("fechaHoraNotificacion: finalizadaEn, si no vistoBuenoEn, si no null", () => {
    const a = new Date(1);
    const b = new Date(2);
    assert.equal(fechaHoraNotificacion({ finalizadaEn: a, vistoBuenoEn: b }), a);
    assert.equal(fechaHoraNotificacion({ finalizadaEn: null, vistoBuenoEn: b }), b);
    assert.equal(fechaHoraNotificacion({ finalizadaEn: null, vistoBuenoEn: null }), null);
  });

  await prueba("hora de Chile en verano e invierno, sin coma", () => {
    assert.equal(formatearFechaHoraSegundosChile(VERANO), "15-01-2025 13:04:05");
    assert.equal(formatearFechaHoraSegundosChile(INVIERNO), "15-07-2025 13:04:05");
  });

  await prueba("nombre de la columna: '(sistema)' si ya existe (NFC, espacios, mayúsculas)", () => {
    assert.equal(nombreColumnaNotificacion(["A"]), NOMBRE_COLUMNA_NOTIFICACION);
    assert.equal(nombreColumnaNotificacion([" FECHA Y HORA DE NOTIFICACIO\u0301N "]), NOMBRE_COLUMNA_NOTIFICACION_SISTEMA);
  });

  await prueba("Content-Disposition: tildes, \u00f1, comillas, barra, '()*' y saltos de l\u00ednea", () => {
    const valor = encabezadoContentDisposition('A\u00f1o "\u00f1and\u00fa"\\(1)*\'x\r\n.xlsx');
    assert.equal(
      valor,
      `attachment; filename="A_o '_and_''(1)*'x.xlsx"; filename*=UTF-8''A%C3%B1o%20%22%C3%B1and%C3%BA%22%5C%281%29%2A%27x.xlsx`,
    );
    assert.ok(!/[\r\n]/.test(valor));
  });

  console.log("CSV");

  await prueba("UTF-8 con BOM, LF, comillas con coma, salto dentro de campo y comillas escapadas", async () => {
    const entrada = Buffer.from('\uFEFFa,b\n1,"x,y"\n2,"línea\nnueva ""cita"""\n', "utf8");
    const salida = await anexarCsv(entrada, "utf-8");
    assert.equal(
      salida.toString("utf8"),
      '\uFEFFa,b,Fecha y hora de notificación\n1,"x,y",15-01-2025 13:04:05\n2,"línea\nnueva ""cita""",15-01-2025 13:04:05\n',
    );
  });

  await prueba("CRLF, sin salto final y líneas en blanco intactas", async () => {
    const salida = await anexarCsv(Buffer.from("a,b\r\n1,2\r\n\r\n3,4", "utf8"), "utf-8", 1);
    assert.equal(
      salida.toString("utf8"),
      "a,b,Fecha y hora de notificación\r\n1,2,15-01-2025 13:04:05\r\n\r\n3,4,15-01-2025 13:04:05",
    );
  });

  await prueba("Windows-1252: conserva la codificación y escribe el encabezado en ella", async () => {
    const entrada = Buffer.from("año,b\n1,2\n", "latin1");
    const salida = await anexarCsv(entrada, "windows-1252");
    assert.deepEqual(salida, Buffer.from("año,b,Fecha y hora de notificación\n1,2,15-01-2025 13:04:05\n", "latin1"));
  });

  await prueba("CSV con la columna ya presente: '(sistema)'", async () => {
    const salida = await anexarCsv(Buffer.from("a,Fecha y hora de notificación\n1,2\n", "utf8"), "utf-8");
    assert.ok(salida.toString("utf8").startsWith("a,Fecha y hora de notificación,Fecha y hora de notificación (sistema)\n"));
  });

  console.log("xlsx");

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Datos");
  hoja.addRow(["Texto", "Número", "Fecha", "Fecha hora", "Booleano"]);
  hoja.addRow(["=SUMA(A1)", 12.5, new Date(Date.UTC(2024, 2, 1)), new Date(Date.UTC(2024, 2, 1, 10, 30)), true, "fuera"]);
  hoja.addRow([]);
  hoja.getRow(4).height = 20; // fila vacía con estilo
  hoja.addRow([{ formula: "1+1", result: 2 }, null, null, null, false]);
  hoja.getCell("A6").value = "combinada";
  hoja.mergeCells("A6:B6");
  libro.addWorksheet("Otra").addRow(["no", "va"]);
  const contenido = Buffer.from(await libro.xlsx.writeBuffer());
  const generador = crearGeneradorDescargaCargaExcelJs({ rutaAbsoluta: () => "no-se-usa" });

  await prueba("xlsx: columna al final, tipos, '=' como texto, fechas, sin otras hojas ni celdas fuera", async () => {
    const generado = await generador.generar({ fuente: { contenido }, tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fechaNotificacion: INVIERNO });
    const leida = await leerXlsx(generado.flujo);
    assert.equal(leida.getCell("F1").value, NOMBRE_COLUMNA_NOTIFICACION);
    assert.equal(leida.getCell("A2").value, "=SUMA(A1)", "nunca una fórmula");
    assert.equal(leida.getCell("A2").type, ExcelJS.ValueType.String);
    assert.equal(leida.getCell("B2").value, 12.5);
    assert.equal((leida.getCell("C2").value as Date).toISOString(), "2024-03-01T00:00:00.000Z");
    assert.equal(leida.getCell("C2").numFmt, "dd-mm-yyyy");
    assert.equal(leida.getCell("D2").numFmt, "dd-mm-yyyy hh:mm");
    assert.equal(leida.getCell("E2").value, true);
    assert.equal((leida.getCell("F2").value as Date).toISOString(), "2025-07-15T13:04:05.000Z", "hora de pared de Chile");
    assert.equal(leida.getCell("F2").numFmt, "dd-mm-yyyy hh:mm:ss");
    assert.equal(leida.getCell("G2").value, null, "celda fuera del encabezado descartada");
    assert.equal(leida.getCell("F3").value, null, "fila vacía sin fecha");
    assert.equal(leida.getCell("F4").value, null, "fila de residuo sin fecha");
    assert.equal(leida.getCell("A5").value, 2, "fórmula → su valor");
    assert.equal(leida.getCell("B6").value, "combinada", "combinada rellenada");
  });

  await prueba("xlsx: hora de verano y archivo ilegible lanza antes de devolver", async () => {
    const generado = await generador.generar({ fuente: { contenido }, tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fechaNotificacion: VERANO });
    const leida = await leerXlsx(generado.flujo);
    assert.equal((leida.getCell("F2").value as Date).toISOString(), "2025-01-15T13:04:05.000Z");

    await assert.rejects(() =>
      generador.generar({ fuente: { contenido: Buffer.from("no es un zip") }, tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fechaNotificacion: VERANO }),
    );
  });

  await prueba("xlsx: colisión de nombre → '(sistema)'", async () => {
    const otro = new ExcelJS.Workbook();
    otro.addWorksheet("D").addRows([["Fecha y hora de notificación"], ["x"]]);
    const generado = await generador.generar({
      fuente: { contenido: Buffer.from(await otro.xlsx.writeBuffer()) },
      tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fechaNotificacion: VERANO,
    });
    const leida = await leerXlsx(generado.flujo);
    assert.equal(leida.getCell("B1").value, NOMBRE_COLUMNA_NOTIFICACION_SISTEMA);
  });

  await prueba("xlsx: el cliente cancela a mitad de la descarga sin excepciones fuera de promesa", async () => {
    const grande = new ExcelJS.Workbook();
    const hojaGrande = grande.addWorksheet("D");
    hojaGrande.addRow(["a", "b"]);
    for (let indice = 0; indice < 40_000; indice += 1) hojaGrande.addRow([`texto ${indice}`, indice]);
    const binario = Buffer.from(await grande.xlsx.writeBuffer());
    let excepcion: unknown = null;
    const escucha = (error: unknown) => {
      excepcion = error;
    };
    process.on("uncaughtException", escucha);
    try {
      for (let intento = 0; intento < 3; intento += 1) {
        const generado = await generador.generar({ fuente: { contenido: binario }, tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fechaNotificacion: VERANO });
        const lector = generado.flujo.getReader();
        await lector.read();
        await lector.cancel();
      }
      await new Promise((resolver) => setTimeout(resolver, 500));
    } finally {
      process.off("uncaughtException", escucha);
    }
    assert.equal(excepcion, null);
  });

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
