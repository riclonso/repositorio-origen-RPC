// RF-38: prueba de CARGA manual (no forma parte de las pruebas automáticas). Genera dos
// .xlsx de ~100 MB y ~500.000 filas × 40 columnas en un directorio temporal FUERA del repositorio y
// mide, cada escenario en su propio proceso, el tiempo y el RSS máximo (muestreo cada 250 ms):
//
//   (a) datos clínicos realistas, con muchos textos repetidos;
//   (b) peor caso de textos compartidos (la mayoría únicos).
//
//   1. recepción (almacén en disco real: tamaño, SHA-256, temporal y movimiento);
//   2. validación (formato con 2 reglas FILA_DUPLICADA, RUT_VALIDO, CONTENIDO_HTML, FILA_VACIA y
//      enumerados), y la misma sin las reglas FILA_DUPLICADA para medir su costo;
//   3. descarga con la columna "Fecha y hora de notificación" (consumida completa);
//   4. 2 validaciones + 2 descargas simultáneas.
//
// No usa base de datos ni el servidor de desarrollo.
//
//   npx tsx tests/carga-100mb.manual.ts todo <directorio-temporal>
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { FormatoExcel, ReglaValidacionFormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";

process.env.DATABASE_URL ??= "postgres://prueba:prueba@localhost:1/prueba";
process.env.AUTH_SECRET ??= "secreto-de-prueba-de-al-menos-32-caracteres";

const FILAS = 500_000;
// Columnas libres por archivo, para quedar bajo el límite de 100 MiB con 500.000 filas:
// (a) 8 fijas + 30 repetidas = 38; (b) 8 fijas + 8 de textos únicos + 8 repetidas = 24.
const COLUMNAS_LIBRES: Record<string, number> = { "a-realista.xlsx": 30, "b-unicos.xlsx": 16 };
const COLUMNAS_UNICAS = 8;

function encabezados(columnasLibres: number): string[] {
  return [
    "RUT",
    "Nombre",
    "Apellido",
    "Fecha Nacimiento",
    "Fecha Diagnóstico",
    "Sexo",
    "Edad",
    "Comuna",
    ...Array.from({ length: columnasLibres }, (_, indice) => `Campo ${indice + 1}`),
  ];
}
const VENTANA = { anio: 2024, fechaApertura: new Date(Date.UTC(2025, 0, 1)), fechaVencimiento: new Date(Date.UTC(2025, 11, 31)) };

function digitoVerificador(cuerpo: number): string {
  let suma = 0;
  let multiplicador = 2;
  for (const digito of String(cuerpo).split("").reverse()) {
    suma += Number(digito) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

function crearAleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = ["Ana", "Luis", "María José", "Pedro", "Sofía", "Tomás", "Valentina", "Benjamín", "Isidora", "Matías"];
const APELLIDOS = ["Pérez", "González", "Muñoz", "Rojas", "Díaz", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda"];
const COMUNAS = ["Concepción", "Talcahuano", "Coronel", "Lota", "Los Ángeles", "Tomé", "Penco", "Chiguayante"];
const CATEGORIAS = ["Adenocarcinoma", "Carcinoma escamoso", "Melanoma", "Linfoma", "Sarcoma", "Sin dato", "Otro"];

async function generar(ruta: string, unicos: boolean, columnasLibres: number): Promise<void> {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: ruta, useSharedStrings: true, useStyles: true });
  const hoja = libro.addWorksheet("Datos");
  hoja.addRow(encabezados(columnasLibres)).commit();
  const aleatorio = crearAleatorio(unicos ? 99 : 7);
  for (let indice = 0; indice < FILAS; indice += 1) {
    const cuerpo = 5_000_000 + indice * 37;
    const valores: ExcelJS.CellValue[] = [
      `${cuerpo}-${digitoVerificador(cuerpo)}`,
      NOMBRES[indice % NOMBRES.length],
      APELLIDOS[Math.floor(aleatorio() * APELLIDOS.length)],
      new Date(Date.UTC(1940 + Math.floor(aleatorio() * 70), Math.floor(aleatorio() * 12), 1 + Math.floor(aleatorio() * 28))),
      new Date(Date.UTC(2024, Math.floor(aleatorio() * 12), 1 + Math.floor(aleatorio() * 28))),
      aleatorio() < 0.5 ? "Masculino" : "Femenino",
      Math.floor(aleatorio() * 100),
      COMUNAS[Math.floor(aleatorio() * COMUNAS.length)],
    ];
    // (b): 8 columnas con textos únicos (4 millones de textos compartidos distintos). Con todas las
    // columnas únicas el ESCRITOR de exceljs no puede generar el archivo (su tabla hash supera el
    // máximo de propiedades de V8) y el archivo pasaría de 100 MiB.
    for (let columna = 0; columna < columnasLibres; columna += 1) {
      valores.push(
        unicos && columna < COLUMNAS_UNICAS
          ? `${indice.toString(36)}-${columna}-${Math.floor(aleatorio() * 1e9).toString(36)}`
          : CATEGORIAS[(indice + columna) % CATEGORIAS.length],
      );
    }
    const fila = hoja.addRow(valores);
    fila.getCell(4).numFmt = "dd-mm-yyyy";
    fila.getCell(5).numFmt = "dd-mm-yyyy";
    fila.commit();
  }
  hoja.commit();
  await libro.commit();
}

function regla(orden: number, tipo: ReglaValidacionFormatoExcel["tipo"], columnas: string[]): ReglaValidacionFormatoExcel {
  return { id: `r${orden}`, orden, tipo, columnas, mensaje: `regla ${orden}` };
}

function formato(conDuplicadas: boolean, columnasLibres: number): FormatoExcel {
  const nombresColumnas = encabezados(columnasLibres);
  return {
    id: "carga",
    nombre: "Carga",
    descripcion: null,
    nombreArchivoPlantilla: "p.xlsx",
    tipoContenidoPlantilla: "x",
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    columnas: nombresColumnas.map((nombre, indice) => ({
      id: `c${indice}`,
      orden: indice + 1,
      nombre,
      requerida: indice < 5,
      tipoDato: nombre.startsWith("Fecha") ? "FECHA" : nombre === "Edad" ? "ENTERO" : nombre === "Sexo" ? "ENUMERADO" : "TEXTO",
      tipoEnumeradoNombre: nombre === "Sexo" ? "Sexo" : null,
    })),
    reglasValidacion: [
      ...(conDuplicadas ? [regla(1, "FILA_DUPLICADA", ["RUT"]), regla(2, "FILA_DUPLICADA", ["Nombre", "Apellido", "Fecha Nacimiento"])] : []),
      regla(3, "RUT_VALIDO", ["RUT"]),
      regla(4, "CONTENIDO_HTML", []),
      regla(5, "FILA_VACIA", []),
    ],
    tiposEnumerados: [{ id: "e", orden: 1, nombre: "Sexo", valores: ["Masculino", "Femenino", "Intersex"] }],
  };
}

function iniciarMuestreo(): () => number {
  let maximo = process.memoryUsage().rss;
  const intervalo = setInterval(() => {
    maximo = Math.max(maximo, process.memoryUsage().rss);
  }, 250);
  return () => {
    clearInterval(intervalo);
    return Math.max(maximo, process.memoryUsage().rss);
  };
}

async function consumir(flujo: ReadableStream<Uint8Array>): Promise<number> {
  let bytes = 0;
  const lector = flujo.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return bytes;
    bytes += value.byteLength;
  }
}

async function escenario(nombre: string, directorio: string, archivo: string): Promise<Record<string, unknown>> {
  const ruta = path.join(directorio, archivo);
  const { validarXlsxEnStreaming } = await import("../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming");
  const { crearGeneradorDescargaCargaExcelJs, conLimitadorDescargas } = await import(
    "../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs"
  );
  const { limitadorDescargasCargas, limitadorValidacionCargas } = await import("../src/modules/reporte-excel/infrastructure/concurrencia/limitadoresCargas");
  const generador = conLimitadorDescargas(crearGeneradorDescargaCargaExcelJs({ rutaAbsoluta: (referencia) => referencia }), limitadorDescargasCargas);
  const tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const terminar = iniciarMuestreo();
  const inicio = performance.now();
  const extra: Record<string, unknown> = {};

  if (nombre === "recepcion") {
    const { crearAlmacenArchivosDisco } = await import("../src/infrastructure/almacenamiento/AlmacenArchivosDisco");
    const base = path.join(directorio, "almacen");
    const almacen = crearAlmacenArchivosDisco({ obtenerDirectorioBase: () => base, etiqueta: "carga", bytesPrimeros: 4 });
    const guardado = await almacen.guardarTemporal(Readable.toWeb(createReadStream(ruta)) as ReadableStream<Uint8Array>, 100 * 1024 * 1024);
    if (!guardado.ok) throw new Error(`recepción rechazada: ${guardado.motivo}`);
    await almacen.moverDefinitivo(guardado.referenciaTemporal, 2024, crypto.randomUUID(), "xlsx");
    extra.tamanoBytes = guardado.tamanoBytes;
    await rm(base, { recursive: true, force: true });
  } else if (nombre === "validacion" || nombre === "validacion-sin-duplicadas") {
    const resultado = await validarXlsxEnStreaming({ ruta }, formato(nombre === "validacion", COLUMNAS_LIBRES[archivo]), VENTANA);
    extra.estado = resultado.estado;
    extra.cantidadFilasDatos = resultado.cantidadFilasDatos;
    extra.cantidadErrores = resultado.cantidadErrores;
    extra.primerError = resultado.errores[0] ? `${resultado.errores[0].tipoError}: ${resultado.errores[0].mensaje}` : null;
  } else if (nombre === "descarga") {
    const generado = await generador.generar({ fuente: { referencia: ruta }, tipoContenido: tipo, fechaNotificacion: new Date() });
    extra.bytesGenerados = await consumir(generado.flujo);
  } else if (nombre === "concurrente") {
    const tareas = [
      limitadorValidacionCargas.ejecutar(() => validarXlsxEnStreaming({ ruta }, formato(true, COLUMNAS_LIBRES[archivo]), VENTANA)),
      limitadorValidacionCargas.ejecutar(() => validarXlsxEnStreaming({ ruta }, formato(true, COLUMNAS_LIBRES[archivo]), VENTANA)),
      generador.generar({ fuente: { referencia: ruta }, tipoContenido: tipo, fechaNotificacion: new Date() }).then((generado) => consumir(generado.flujo)),
      generador.generar({ fuente: { referencia: ruta }, tipoContenido: tipo, fechaNotificacion: new Date() }).then((generado) => consumir(generado.flujo)),
    ];
    await Promise.all(tareas);
  }

  const segundos = (performance.now() - inicio) / 1000;
  const rssMaximo = terminar();
  return { escenario: nombre, archivo, segundos: Number(segundos.toFixed(1)), rssMaximoMB: Math.round(rssMaximo / 1024 / 1024), ...extra };
}

async function main(): Promise<void> {
  const [modo, directorio, nombre, archivo] = process.argv.slice(2);
  if (!directorio) throw new Error("Indica un directorio temporal fuera del repositorio");

  if (modo === "escenario") {
    console.log(JSON.stringify(await escenario(nombre, directorio, archivo)));
    return;
  }

  await mkdir(directorio, { recursive: true });
  const archivos = { "a-realista.xlsx": false, "b-unicos.xlsx": true };
  for (const [nombreArchivo, unicos] of Object.entries(archivos)) {
    const ruta = path.join(directorio, nombreArchivo);
    if (!(await readdir(directorio)).includes(nombreArchivo)) {
      const inicio = performance.now();
      await generar(ruta, unicos, COLUMNAS_LIBRES[nombreArchivo]);
      console.log(`generado ${nombreArchivo}: ${((await stat(ruta)).size / 1024 / 1024).toFixed(1)} MB en ${((performance.now() - inicio) / 1000).toFixed(0)} s`);
    }
  }

  for (const nombreArchivo of Object.keys(archivos)) {
    for (const nombreEscenario of ["recepcion", "validacion", "validacion-sin-duplicadas", "descarga", "concurrente"]) {
      const hijo = spawnSync(process.execPath, [...process.execArgv, __filename, "escenario", directorio, nombreEscenario, nombreArchivo], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
      const salida = hijo.stdout.trim().split("\n").at(-1) ?? "";
      console.log(hijo.status === 0 ? salida : `FALLÓ ${nombreArchivo} ${nombreEscenario}: ${hijo.stderr.slice(-2000)}`);
    }
  }
}

void main();
