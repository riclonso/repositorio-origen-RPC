import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import ExcelJS from "exceljs";

process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

function flujo(bytes: Buffer) {
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, 2)); c.enqueue(bytes.subarray(2)); c.close(); } });
}

async function entorno(t: import("node:test").TestContext) {
  const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
  const dir = await mkdtemp(path.join(tmpdir(), "rpc-cifrado-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const claves = { activa: "v1", claves: { v1: randomBytes(32) } };
  const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => dir, etiqueta: "prueba", bytesPrimeros: 4, obtenerClavesExcel: () => claves });
  return { dir, claves, almacen };
}

async function guardar(almacen: Awaited<ReturnType<typeof entorno>>["almacen"], bytes: Buffer, usuarioId = randomUUID()) {
  const archivoId = randomUUID();
  const guardado = await almacen.guardarTemporal(flujo(bytes), bytes.length + 1, { usuarioId, archivoId, excel: true });
  assert.ok(guardado.ok);
  const referencia = await almacen.moverDefinitivo(guardado.referenciaTemporal, 2026, archivoId, "xlsx");
  return { referencia, guardado };
}

async function contenido(almacen: Awaited<ReturnType<typeof entorno>>["almacen"], ref: string) {
  const lectura = await almacen.abrirLectura(ref);
  assert.ok(lectura);
  return Buffer.from(await new Response(lectura.flujo).arrayBuffer());
}

test("cifra temporales y definitivos, devuelve bytes originales y lee rangos entre bloques", async t => {
  const { almacen } = await entorno(t);
  const bytes = Buffer.concat([Buffer.from("PK\x03\x04"), randomBytes(150000)]);
  const archivoId = randomUUID();
  const temporal = await almacen.guardarTemporal(flujo(bytes), bytes.length, { usuarioId: randomUUID(), archivoId, excel: true });
  assert.ok(temporal.ok);
  const raw = await readFile(almacen.rutaAbsoluta(temporal.referenciaTemporal));
  assert.equal(raw.subarray(0, 8).toString(), "RPCXLS01");
  assert.equal(raw.includes(bytes.subarray(10, 100)), false);
  assert.deepEqual(await contenido(almacen, temporal.referenciaTemporal), bytes);
  const ref = await almacen.moverDefinitivo(temporal.referenciaTemporal, 2026, archivoId, "xlsx");
  assert.ok(ref.endsWith(".xlsx.enc"));
  const lectura = await almacen.abrirLectura(ref);
  assert.equal(lectura?.tamanoBytes, bytes.length);
  await lectura?.flujo.cancel();
  const fuente = await almacen.fuenteXlsx(ref);
  const partes: Buffer[] = [];
  for await (const parte of fuente.stream(65530, 100)) partes.push(parte);
  assert.deepEqual(Buffer.concat(partes), bytes.subarray(65530, 65631));
});

test("validación y descarga generada leen un XLSX cifrado sin temporal descifrado", async t => {
  const { almacen, dir } = await entorno(t);
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Datos");
  hoja.addRow(["Nombre", "Número"]); hoja.addRow(["José", 7]);
  const bytes = Buffer.from(await libro.xlsx.writeBuffer());
  const { referencia } = await guardar(almacen, bytes);
  const { recorrerFilasPrimeraHojaXlsx } = await import("../src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs");
  const filas = [];
  for await (const fila of recorrerFilasPrimeraHojaXlsx({ fuenteZip: await almacen.fuenteXlsx(referencia) })) filas.push(fila);
  assert.deepEqual(filas[1].valores, ["José", 7]);
  const { crearLectorArchivoLibreStreaming } = await import("../src/modules/bioestadistica/infrastructure/lectura-archivo/LectorArchivoLibreStreamingExcelJs");
  const lector = crearLectorArchivoLibreStreaming(almacen);
  assert.deepEqual(await lector.leerEncabezados(referencia, "XLSX"), ["Nombre", "Número"]);
  const datos = []; for await (const fila of lector.recorrerFilas(referencia, "XLSX")) datos.push(fila);
  assert.deepEqual(datos[0].valores, ["José", 7]);
  const { crearGeneradorDescargaCargaExcelJs } = await import("../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs");
  const generado = await crearGeneradorDescargaCargaExcelJs(almacen).generar({ fuente: { referencia }, tipoContenido: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fechaNotificacion: new Date("2026-10-08T12:00:00Z") });
  const salida = Buffer.from(await new Response(generado.flujo).arrayBuffer());
  const descargado = new ExcelJS.Workbook(); await descargado.xlsx.load(new Uint8Array(salida).buffer);
  assert.equal(descargado.worksheets[0].getRow(2).getCell(1).value, "José");
  assert.deepEqual(await contenido(almacen, referencia), bytes);
  assert.deepEqual(await readdir(path.join(dir, "tmp")), []);
});

test("rechaza bloques alterados, truncamiento, cambio de dueño y sustitución de carga", async t => {
  const { almacen } = await entorno(t);
  const { referencia } = await guardar(almacen, randomBytes(70000));
  const ruta = almacen.rutaAbsoluta(referencia); const original = await readFile(ruta);
  const alterado = Buffer.from(original); alterado[550] ^= 1;
  await writeFile(ruta, alterado); await assert.rejects(() => contenido(almacen, referencia));
  await writeFile(ruta, original.subarray(0, original.length - 1)); await assert.rejects(() => contenido(almacen, referencia));
  const cabecera = Buffer.from(original); const length = cabecera.readUInt32BE(8);
  const meta = JSON.parse(cabecera.subarray(12, 12 + length).toString()); meta.usuarioId = randomUUID();
  Buffer.from(JSON.stringify(meta)).copy(cabecera, 12);
  await writeFile(ruta, cabecera); await assert.rejects(() => contenido(almacen, referencia));
  await writeFile(ruta, original);
  const otra = `2026/${randomUUID()}.xlsx.enc`; await writeFile(almacen.rutaAbsoluta(otra), original);
  await assert.rejects(() => contenido(almacen, otra), /no corresponde/);
  const firma = Buffer.from(original); firma[0] ^= 1;
  await writeFile(ruta, firma); await assert.rejects(() => contenido(almacen, referencia), /inválido/);
});

test("aleatoriedad por archivo, clave incorrecta y rotación con clave anterior conservada", async t => {
  const { almacen, claves } = await entorno(t); const bytes = randomBytes(80000); const usuario = randomUUID();
  const a = await guardar(almacen, bytes, usuario), b = await guardar(almacen, bytes, usuario);
  assert.notDeepEqual(await readFile(almacen.rutaAbsoluta(a.referencia)), await readFile(almacen.rutaAbsoluta(b.referencia)));
  const anterior = claves.claves.v1; claves.claves.v1 = randomBytes(32);
  await assert.rejects(() => contenido(almacen, a.referencia));
  claves.claves.v1 = anterior;
  Object.assign(claves.claves, { v2: randomBytes(32) }); claves.activa = "v2";
  assert.deepEqual(await contenido(almacen, a.referencia), bytes);
  const c = await guardar(almacen, bytes); assert.deepEqual(await contenido(almacen, c.referencia), bytes);
});

test("CSV y archivos anteriores siguen en claro; exceso de tamaño limpia el temporal cifrado", async t => {
  const { almacen, dir } = await entorno(t);
  const bytes = Buffer.from("nombre,valor\nJosé,7\n");
  const r = await almacen.guardarTemporal(flujo(bytes), 1000, { usuarioId: randomUUID(), archivoId: randomUUID(), excel: false });
  assert.ok(r.ok); assert.deepEqual(await readFile(almacen.rutaAbsoluta(r.referenciaTemporal)), bytes);
  await almacen.eliminar(r.referenciaTemporal);
  const legacy = await almacen.guardarTemporal(flujo(bytes), 1000); assert.ok(legacy.ok);
  assert.deepEqual(await contenido(almacen, legacy.referenciaTemporal), bytes);
  await almacen.eliminar(legacy.referenciaTemporal);
  const rechazado = await almacen.guardarTemporal(flujo(randomBytes(90000)), 1, { usuarioId: randomUUID(), archivoId: randomUUID(), excel: true });
  assert.equal(rechazado.ok, false); assert.deepEqual(await readdir(path.join(dir, "tmp")), []);
});

test("sin clave maestra rechaza nuevas cargas Excel antes de escribir archivos", async t => {
  const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
  const dir = await mkdtemp(path.join(tmpdir(), "rpc-sin-clave-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => dir, etiqueta: "prueba", bytesPrimeros: 4, obtenerClavesExcel: () => { throw new Error("Falta clave"); } });
  await assert.rejects(() => almacen.guardarTemporal(flujo(Buffer.from("PK\x03\x04")), 100, { usuarioId: randomUUID(), archivoId: randomUUID(), excel: true }), /Falta clave/);
  assert.deepEqual(await readdir(dir), []);
});
