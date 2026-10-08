import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { anexarColumnaXml, generarXlsxGrande } from "../src/modules/reporte-excel/infrastructure/generacion-excel/AnexarFechaXlsxGrande";

process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";
const fecha = new Date("2026-10-08T19:20:00Z");
const titulo = "Fecha y hora de notificación";

async function libro(otraHoja = false, date1904 = false) {
  const libro = new ExcelJS.Workbook();
  libro.properties.date1904 = date1904;
  const hoja = libro.addWorksheet("Original");
  if (otraHoja) libro.addWorksheet("Auxiliar").addRow(["auxiliar"]);
  hoja.addRows([["nombre", "valor"], ["Ana & José", 7], ["otra", { formula: "B2*2", result: 14 }]]);
  hoja.getCell("B2").numFmt = '"$"#,##0.00';
  const zip = await JSZip.loadAsync(await libro.xlsx.writeBuffer());
  const compartidos = await zip.file("xl/sharedStrings.xml")!.async("string");
  const textos = [...compartidos.matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g)].map(match => match[1]);
  for (const ruta of Object.keys(zip.files).filter(ruta => /^xl\/worksheets\/[^/]+\.xml$/.test(ruta))) {
    const xml = await zip.file(ruta)!.async("string");
    zip.file(ruta, xml.replace(/<c([^>]*) t="s"><v>(\d+)<\/v><\/c>/g, (_, atributos: string, indice: string) => `<c${atributos} t="inlineStr"><is><t>${textos[Number(indice)]}</t></is></c>`));
  }
  zip.remove("xl/sharedStrings.xml");
  for (const ruta of ["xl/_rels/workbook.xml.rels", "[Content_Types].xml"]) {
    zip.file(ruta, (await zip.file(ruta)!.async("string")).replace(/<(?:Relationship|Override)\b[^>]*sharedStrings[^>]*\/>/g, ""));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

test("transformación XML: comentarios, CDATA y marcas partidas entre trozos", async () => {
  const xml = '<worksheet><dimension ref="A1:B3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>nombre</t></is></c></row><!-- <row r="999"> </row> --><row r="2"><c r="A2" t="inlineStr"><is><t><![CDATA[José </row>]]></t></is></c></row><row r="3"/></sheetData></worksheet>';
  for (const ancho of [1, 7, 64, xml.length]) {
    async function* trozos() { for (let i = 0; i < xml.length; i += ancho) yield xml.slice(i, i + ancho); }
    let salida = "";
    for await (const parte of anexarColumnaXml(trozos(), "C", titulo, "08-10-2026 16:20:00")) salida += parte;
    assert.ok(salida.includes('ref="A1:C3"'));
    assert.ok(salida.includes('r="C1"'));
    assert.ok(salida.includes('r="C2"'));
    assert.ok(salida.includes('r="C3"'));
    assert.equal(salida.includes('r="C999"'), false);
    assert.ok(salida.includes("<![CDATA[José </row>]]>"));
  }
});

test("conserva valores, fórmulas y estilos y agrega la misma fecha a todas las filas", async () => {
  const flujo = await generarXlsxGrande({ buffer: await libro(true) }, fecha, () => titulo, undefined, 0);
  assert.ok(flujo);
  const salida = new ExcelJS.Workbook();
  await salida.xlsx.load(Buffer.from(await new Response(flujo).arrayBuffer()) as unknown as ExcelJS.Buffer);
  const hoja = salida.getWorksheet("Original")!;
  assert.equal(hoja.getCell("A2").value, "Ana & José");
  assert.equal(hoja.getCell("B2").numFmt, '"$"#,##0.00');
  assert.deepEqual(hoja.getCell("B3").value, { formula: "B2*2", result: 14 });
  assert.equal(hoja.getCell("C1").value, titulo);
  assert.equal((hoja.getCell("C2").value as Date).toISOString(), "2026-10-08T16:20:00.000Z");
  assert.equal(hoja.getCell("C2").numFmt, "dd-mm-yyyy hh:mm");
  assert.equal(salida.getWorksheet("Auxiliar")!.getCell("A1").value, "auxiliar");
  assert.equal(salida.getWorksheet("Auxiliar")!.getCell("B1").value, null);
  assert.deepEqual(hoja.getCell("C3").value, hoja.getCell("C2").value);
});

test("libros pequeños o con textos compartidos usan el camino existente", async () => {
  assert.equal(await generarXlsxGrande({ buffer: await libro() }, fecha, () => titulo), null);
  const dos = new ExcelJS.Workbook();
  dos.addWorksheet("Primera").addRows([["dato"], ["x"]]);
  dos.addWorksheet("Otra").addRows([["otro"]]);
  assert.equal(await generarXlsxGrande({ buffer: Buffer.from(await dos.xlsx.writeBuffer()) }, fecha, () => titulo, undefined, 0), null);
  const compartidos = new ExcelJS.Workbook();
  compartidos.addWorksheet("Datos").addRows([["dato"], ["x"]]);
  const buffer = Buffer.from(await compartidos.xlsx.writeBuffer({ useSharedStrings: true }));
  assert.ok((await JSZip.loadAsync(buffer)).file("xl/sharedStrings.xml"));
  assert.equal(await generarXlsxGrande({ buffer }, fecha, () => titulo, undefined, 0), null);
});

test("la fecha mantiene la hora de Chile también con calendario Excel 1904", async () => {
  const flujo = await generarXlsxGrande({ buffer: await libro(false, true) }, fecha, encabezados => {
    assert.deepEqual(encabezados, ["nombre", "valor"]);
    return titulo;
  }, undefined, 0);
  assert.ok(flujo);
  const salida = new ExcelJS.Workbook();
  await salida.xlsx.load(new Uint8Array(await new Response(flujo).arrayBuffer()).buffer);
  assert.equal(salida.properties.date1904, true);
  assert.equal((salida.worksheets[0].getCell("C2").value as Date).toISOString(), "2026-10-08T16:20:00.000Z");
});

test("cancelar corta el flujo sin excepciones y permite otra generación", async () => {
  const zip = await JSZip.loadAsync(await libro());
  zip.file("xl/media/prueba.bin", randomBytes(1024 * 1024));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const control = new AbortController();
  const flujo = await generarXlsxGrande({ buffer }, fecha, () => titulo, control.signal, 0);
  assert.ok(flujo);
  const lector = flujo.getReader();
  await lector.read();
  control.abort();
  await assert.rejects(async () => { while (!(await lector.read()).done) { /* consumir lo ya encolado */ } });
  const siguiente = await generarXlsxGrande({ buffer }, fecha, () => titulo, undefined, 0);
  assert.ok(siguiente);
  await new Response(siguiente).arrayBuffer();
});

test("el camino rápido lee el ZIP cifrado sin crear temporales descifrados", async t => {
  const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
  const dir = await mkdtemp(path.join(tmpdir(), "rpc-descarga-grande-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const claves = { activa: "v1", claves: { v1: randomBytes(32) } };
  const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => dir, etiqueta: "prueba", bytesPrimeros: 4, obtenerClavesExcel: () => claves });
  const buffer = await libro();
  const archivoId = randomUUID();
  const guardado = await almacen.guardarTemporal(new Response(new Uint8Array(buffer)).body!, buffer.length + 1, { usuarioId: randomUUID(), archivoId, excel: true });
  assert.ok(guardado.ok);
  const referencia = await almacen.moverDefinitivo(guardado.referenciaTemporal, 2026, archivoId, "xlsx");
  const flujo = await generarXlsxGrande({ fuenteZip: await almacen.fuenteXlsx(referencia) }, fecha, () => titulo, undefined, 0);
  assert.ok(flujo);
  const salida = new ExcelJS.Workbook();
  await salida.xlsx.load(Buffer.from(await new Response(flujo).arrayBuffer()) as unknown as ExcelJS.Buffer);
  assert.equal((salida.worksheets[0].getCell("C2").value as Date).toISOString(), "2026-10-08T16:20:00.000Z");
  assert.deepEqual(await readdir(path.join(dir, "2026")), [`${archivoId}.xlsx.enc`]);
});
