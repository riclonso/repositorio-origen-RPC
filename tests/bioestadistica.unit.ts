// RF-37 (perfil Bioestadística), sin base de datos: reglas de dominio puras, detección de
// separador y codificación CSV, conversión de celdas, lectores en streaming (xlsx y csv sobre
// archivos temporales), almacén en disco (límite, firma, path traversal), limitador de concurrencia
// y el procesamiento asíncrono con un repositorio en memoria.
//
//   npx tsx tests/bioestadistica.unit.ts
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { resolverAniosDisponibles } from "../src/modules/bioestadistica/domain/entities/DisponibilidadAnio";
import {
  derivarEstadoTarjetaBioestadistica,
  ultimoFalloVisible,
} from "../src/modules/bioestadistica/domain/entities/EstadoTarjetaBioestadistica";
import { validarEncabezados } from "../src/modules/bioestadistica/domain/entities/ValidacionEncabezados";
import {
  HORAS_EXPIRACION_PROCESAMIENTO,
  MAXIMO_COLUMNAS_BIOESTADISTICA,
  TAMANO_LOTE_FILAS_BIOESTADISTICA,
  agruparHistorialPorAnioYTipo,
  detectarFormatoArchivo,
  procesamientoExpirado,
  type CargaBioestadistica,
  type CargaBioestadisticaParaProcesar,
  type FilaCargaBioestadistica,
  type MotivoFalloCargaBioestadistica,
} from "../src/modules/bioestadistica/domain/entities/CargaBioestadistica";
import {
  solicitudBioestadisticaUtilizable,
  solicitudBioestadisticaVencida,
} from "../src/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import {
  detectarCodificacionCsvStreaming,
  detectarSeparadorCsv,
} from "../src/shared/utils/texto-csv";
import { celdaAValor } from "../src/infrastructure/hojas-calculo/valorCelda";
import { recorrerRegistrosCsv } from "../src/infrastructure/hojas-calculo/leerCsvStreaming";
import { recorrerFilasPrimeraHojaXlsx } from "../src/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";
import { crearLimitadorConcurrencia } from "../src/modules/bioestadistica/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";
import { procesarCargaBioestadistica } from "../src/modules/bioestadistica/application/use-cases/ProcesarCargaBioestadistica";
import type {
  CargaBioestadisticaRepository,
  DatosActivacionCargaBioestadistica,
} from "../src/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { AlmacenArchivos } from "../src/modules/bioestadistica/application/ports";

// El almacén y el lector de infraestructura importan `env.ts`, que valida al importarse: se fijan
// valores ficticios (nunca usados para conectarse a nada) y esos módulos se cargan con `import()`
// dinámico dentro de `main()`, después de fijarlos (los `import` estáticos se evalúan antes).
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

// --- Fábricas ---

function carga(parcial: Partial<CargaBioestadistica>): CargaBioestadistica {
  return {
    id: crypto.randomUUID(),
    anio: 2025,
    tipoArchivo: "DEFUNCIONES",
    usuarioId: "u1",
    usuarioNombre: "Persona Prueba",
    usuarioRut: "11111111-1",
    establecimientoId: "e1",
    establecimientoNombre: "Hospital",
    nombreArchivoOriginal: "archivo.xlsx",
    tipoContenidoArchivo: "text/csv",
    tamanoBytes: 10,
    sha256: "0".repeat(64),
    encabezados: ["a"],
    cantidadFilasDatos: 1,
    estado: "ACTIVA",
    motivoFallo: null,
    procesadaEn: null,
    desactivadaEn: null,
    reemplazadaPorCargaId: null,
    createdAt: new Date("2026-01-10T12:00:00Z"),
    ...parcial,
  };
}

async function* trozos(...partes: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const parte of partes) yield parte;
}

async function recolectar<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const resultado: T[] = [];
  for await (const elemento of iterable) resultado.push(elemento);
  return resultado;
}

async function main(): Promise<void> {
  const directorio = await mkdtemp(path.join(tmpdir(), "bioestadistica-unit-"));

  try {
    console.log("Dominio");

    await prueba("años disponibles: unión por año y máximo vencimiento, orden descendente", () => {
      const resultado = resolverAniosDisponibles([
        { anio: 2025, fechaVencimiento: new Date("2026-03-31T23:59:59.999Z") },
        { anio: 2025, fechaVencimiento: new Date("2026-06-30T23:59:59.999Z") },
        { anio: 2024, fechaVencimiento: new Date("2026-01-31T23:59:59.999Z") },
      ]);
      assert.deepEqual(
        resultado.map((anio) => [anio.anio, anio.cierraEl.toISOString()]),
        [
          [2025, "2026-06-30T23:59:59.999Z"],
          [2024, "2026-01-31T23:59:59.999Z"],
        ],
      );
      assert.deepEqual(resolverAniosDisponibles([]), []);
    });

    await prueba("estado de tarjeta: prioridades", () => {
      const base = { hayActiva: false, hayProcesando: false, haySolicitudPendiente: false, haySolicitudUtilizable: false };
      assert.equal(derivarEstadoTarjetaBioestadistica(base), "SUBIR");
      assert.equal(derivarEstadoTarjetaBioestadistica({ ...base, hayProcesando: true, hayActiva: true }), "PROCESANDO");
      assert.equal(derivarEstadoTarjetaBioestadistica({ ...base, hayActiva: true }), "ENVIADO");
      assert.equal(derivarEstadoTarjetaBioestadistica({ ...base, hayActiva: true, haySolicitudPendiente: true }), "SOLICITUD_PENDIENTE");
      assert.equal(
        derivarEstadoTarjetaBioestadistica({ ...base, hayActiva: true, haySolicitudPendiente: true, haySolicitudUtilizable: true }),
        "REEMPLAZO_AUTORIZADO",
      );
    });

    await prueba("último fallo visible solo si es posterior a la vigente", () => {
      const fallo = { motivo: "SIN_FILAS_DATOS" as const, nombreArchivoOriginal: "x.csv", fecha: new Date("2026-02-01T00:00:00Z") };
      assert.equal(ultimoFalloVisible(fallo, null), fallo);
      assert.equal(ultimoFalloVisible(fallo, new Date("2026-03-01T00:00:00Z")), null);
      assert.equal(ultimoFalloVisible(fallo, new Date("2026-01-01T00:00:00Z")), fallo);
      assert.equal(ultimoFalloVisible(null, null), null);
    });

    await prueba("encabezados: vacíos al final se descartan, se recortan", () => {
      assert.deepEqual(validarEncabezados([" Rut ", "Fecha", "", ""]), { ok: true, encabezados: ["Rut", "Fecha"] });
    });

    await prueba("encabezados inválidos: sin columnas, vacío intermedio, duplicado (mayúsculas y espacios), demasiadas", () => {
      assert.deepEqual(validarEncabezados([]), { ok: false, motivo: "SIN_ENCABEZADOS" });
      assert.deepEqual(validarEncabezados(["", " "]), { ok: false, motivo: "SIN_ENCABEZADOS" });
      assert.deepEqual(validarEncabezados(["a", "", "c"]), { ok: false, motivo: "ENCABEZADO_VACIO", columna: 2 });
      assert.deepEqual(validarEncabezados(["Rut", " rut "]), { ok: false, motivo: "ENCABEZADO_DUPLICADO", columna: 2 });
      const muchas = Array.from({ length: MAXIMO_COLUMNAS_BIOESTADISTICA + 1 }, (_, indice) => `c${indice}`);
      assert.deepEqual(validarEncabezados(muchas), { ok: false, motivo: "DEMASIADAS_COLUMNAS" });
      assert.equal(validarEncabezados(muchas.slice(0, MAXIMO_COLUMNAS_BIOESTADISTICA)).ok, true);
    });

    await prueba("procesamiento expirado tras HORAS_EXPIRACION_PROCESAMIENTO horas", () => {
      const ahora = new Date("2026-05-01T12:00:00Z");
      const horas = (n: number) => new Date(ahora.getTime() - n * 3_600_000);
      assert.equal(procesamientoExpirado({ estado: "PROCESANDO", createdAt: horas(HORAS_EXPIRACION_PROCESAMIENTO + 0.1) }, ahora), true);
      assert.equal(procesamientoExpirado({ estado: "PROCESANDO", createdAt: horas(HORAS_EXPIRACION_PROCESAMIENTO - 0.1) }, ahora), false);
      assert.equal(procesamientoExpirado({ estado: "ACTIVA", createdAt: horas(100) }, ahora), false);
    });

    await prueba("historial: grupos por año y tipo, vigente y reemplazadas ordenadas, ignora PROCESANDO y FALLIDA", () => {
      const vigente = carga({ anio: 2025, tipoArchivo: "EGRESOS", estado: "ACTIVA" });
      const viejaA = carga({ anio: 2025, tipoArchivo: "EGRESOS", estado: "REEMPLAZADA", desactivadaEn: new Date("2026-01-01T00:00:00Z") });
      const viejaB = carga({ anio: 2025, tipoArchivo: "EGRESOS", estado: "REEMPLAZADA", desactivadaEn: new Date("2026-02-01T00:00:00Z") });
      const defunciones = carga({ anio: 2025, tipoArchivo: "DEFUNCIONES", estado: "ACTIVA" });
      const otroAnio = carga({ anio: 2026, tipoArchivo: "DEFUNCIONES", estado: "ACTIVA" });
      const fallida = carga({ anio: 2024, estado: "FALLIDA" });
      const procesando = carga({ anio: 2023, estado: "PROCESANDO" });

      const grupos = agruparHistorialPorAnioYTipo([viejaA, vigente, fallida, viejaB, defunciones, procesando, otroAnio]);
      assert.deepEqual(
        grupos.map((grupo) => `${grupo.anio}-${grupo.tipoArchivo}`),
        ["2026-DEFUNCIONES", "2025-DEFUNCIONES", "2025-EGRESOS"],
      );
      const egresos = grupos[2]!;
      assert.equal(egresos.vigente?.id, vigente.id);
      assert.deepEqual(egresos.reemplazadas.map((c) => c.id), [viejaB.id, viejaA.id]);
    });

    await prueba("firma: xlsx exige ZIP, csv sin bytes NUL, extensión no admitida", () => {
      const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);
      const texto = new TextEncoder().encode("a;b\n1;2\n");
      assert.equal(detectarFormatoArchivo("datos.XLSX", zip), "XLSX");
      assert.equal(detectarFormatoArchivo("datos.xlsx", texto), null);
      assert.equal(detectarFormatoArchivo("datos.csv", texto), "CSV");
      assert.equal(detectarFormatoArchivo("datos.csv", new Uint8Array([0x61, 0x00, 0x62])), null);
      assert.equal(detectarFormatoArchivo("datos.csv", new Uint8Array()), null);
      assert.equal(detectarFormatoArchivo("datos.xls", zip), null);
    });

    await prueba("vigencia de solicitud: utilizable con resumen del año, no sin él (año archivado), vencida al pasar el plazo", () => {
      const aprobada = {
        estado: "APROBADA" as const,
        revisadoEn: new Date("2026-04-01T15:00:00Z"),
        diasVigencia: 7,
        utilizadaEn: null,
      };
      // Ventana del año ya vencida: manda revisadoEn + 7 días (fin del día Chile).
      const resumen = { fechaVencimientoMaxima: new Date("2026-03-31T23:59:59.999Z") };
      const dentro = new Date("2026-04-08T12:00:00Z");
      const fuera = new Date("2026-04-10T12:00:00Z");

      assert.equal(solicitudBioestadisticaUtilizable(aprobada, resumen, dentro), true);
      assert.equal(solicitudBioestadisticaUtilizable(aprobada, resumen, fuera), false);
      assert.equal(solicitudBioestadisticaVencida(aprobada, resumen, fuera), true);
      // Sin ninguna ventana publicada y no archivada en el año: no utilizable (ajuste 1 de RF-36).
      assert.equal(solicitudBioestadisticaUtilizable(aprobada, null, dentro), false);
      // Ya usada: ni utilizable ni vencida.
      const usada = { ...aprobada, utilizadaEn: new Date("2026-04-02T00:00:00Z") };
      assert.equal(solicitudBioestadisticaUtilizable(usada, resumen, dentro), false);
      assert.equal(solicitudBioestadisticaVencida(usada, resumen, fuera), false);
      // Ventana vigente más allá del plazo de días: manda el vencimiento de la ventana.
      assert.equal(
        solicitudBioestadisticaUtilizable(aprobada, { fechaVencimientoMaxima: new Date("2026-12-31T23:59:59.999Z") }, fuera),
        true,
      );
    });

    console.log("CSV y celdas");

    await prueba("separador: el más frecuente fuera de comillas; coma por defecto", () => {
      assert.equal(detectarSeparadorCsv("Rut;Nombre;Fecha"), ";");
      assert.equal(detectarSeparadorCsv("Rut,Nombre,Fecha"), ",");
      assert.equal(detectarSeparadorCsv("Rut\tNombre"), "\t");
      assert.equal(detectarSeparadorCsv("Rut|Nombre|x"), "|");
      assert.equal(detectarSeparadorCsv('"a;b;c",d,e'), ",");
      assert.equal(detectarSeparadorCsv("columna"), ",");
    });

    await prueba("codificación: UTF-8 (también con multibyte partido entre trozos) o Windows-1252", async () => {
      const utf8 = new TextEncoder().encode("Año;Niño\n");
      const corte = utf8.indexOf(0xc3) + 1;
      assert.equal(await detectarCodificacionCsvStreaming(trozos(utf8.subarray(0, corte), utf8.subarray(corte))), "utf-8");
      // "Año" en Windows-1252: ñ = 0xF1, inválido como UTF-8.
      assert.equal(await detectarCodificacionCsvStreaming(trozos(new Uint8Array([0x41, 0xf1, 0x6f]))), "windows-1252");
      // Termina a mitad de una secuencia multibyte.
      assert.equal(await detectarCodificacionCsvStreaming(trozos(new Uint8Array([0x41, 0xc3]))), "windows-1252");
    });

    await prueba("celdaAValor: fórmulas, texto enriquecido, hipervínculos, primitivos", () => {
      const fecha = new Date("2026-01-01T00:00:00Z");
      assert.equal(celdaAValor(null), null);
      assert.equal(celdaAValor(fecha), fecha);
      assert.equal(celdaAValor(3), 3);
      assert.equal(celdaAValor({ formula: "A1+1", result: 5 } as ExcelJS.CellValue), 5);
      assert.equal(celdaAValor({ text: "enlace", hyperlink: "https://x" } as ExcelJS.CellValue), "enlace");
      assert.equal(celdaAValor({ richText: [{ text: "a" }, { text: "b" }] } as ExcelJS.CellValue), "ab");
    });

    console.log("Lectores en streaming");

    const rutaCsvUtf8 = path.join(directorio, "utf8.csv");
    await writeFile(
      rutaCsvUtf8,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Año;Comentario\n2024;"línea 1\nlínea 2"\n\n2025;ñandú\n', "utf8")]),
    );

    await prueba("CSV UTF-8 con BOM, separador ';', campo multilínea y línea vacía", async () => {
      const registros = await recolectar(recorrerRegistrosCsv(rutaCsvUtf8));
      assert.deepEqual(registros[0], { numeroRegistro: 1, campos: ["Año", "Comentario"] });
      assert.deepEqual(registros[1]?.campos, ["2024", "línea 1\nlínea 2"]);
      assert.deepEqual(registros.at(-1)?.campos, ["2025", "ñandú"]);
    });

    const rutaCsvAnsi = path.join(directorio, "ansi.csv");
    await writeFile(rutaCsvAnsi, Buffer.from([0x41, 0xf1, 0x6f, 0x2c, 0x42, 0x0a, 0x31, 0x2c, 0xe9, 0x0a]));

    await prueba("CSV Windows-1252 con separador ','", async () => {
      const registros = await recolectar(recorrerRegistrosCsv(rutaCsvAnsi));
      assert.deepEqual(registros.map((registro) => registro.campos), [
        ["Año", "B"],
        ["1", "é"],
      ]);
    });

    await prueba("CSV: cortar tras la primera fila no deja el archivo abierto", async () => {
      for await (const registro of recorrerRegistrosCsv(rutaCsvUtf8)) {
        assert.equal(registro.numeroRegistro, 1);
        break;
      }
      // En Windows un archivo abierto no se puede borrar: si el lector no lo cerró, esto falla.
      const copia = path.join(directorio, "copia.csv");
      await writeFile(copia, "a;b\n1;2\n");
      for await (const registro of recorrerRegistrosCsv(copia)) {
        assert.equal(registro.numeroRegistro, 1);
        break;
      }
      await rm(copia);
    });

    const rutaXlsx = path.join(directorio, "datos.xlsx");
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Datos");
    hoja.addRow(["Rut", "Fecha", "Monto"]);
    hoja.addRow(["1-9", new Date(Date.UTC(2025, 4, 6)), 10.5]);
    hoja.getCell("B2").numFmt = "dd/mm/yyyy";
    hoja.addRow([]);
    hoja.addRow(["2-7", null, 3]);
    libro.addWorksheet("Otra").addRow(["no", "se", "lee"]);
    await libro.xlsx.writeFile(rutaXlsx);

    await prueba("xlsx: solo la primera hoja, fechas como Date, número de fila real", async () => {
      const filas = await recolectar(recorrerFilasPrimeraHojaXlsx(rutaXlsx));
      assert.deepEqual(filas[0]?.valores, ["Rut", "Fecha", "Monto"]);
      assert.ok(filas[1]?.valores[1] instanceof Date);
      assert.equal((filas[1]?.valores[1] as Date).toISOString(), "2025-05-06T00:00:00.000Z");
      assert.equal(filas.at(-1)?.numeroFila, 4);
      assert.ok(filas.every((fila) => !fila.valores.includes("lee")));
    });

    // Regresión: un carácter multibyte (ñ, tildes) partido entre dos trozos descomprimidos quedaba
    // como U+FFFD en el camino por defecto (el de Bioestadística). 60.000 filas de textos únicos con
    // tildes garantizan que muchos caigan en el borde de un trozo de la tabla de textos y de la hoja.
    const rutaTildes = path.join(directorio, "tildes.xlsx");
    const libroTildes = new ExcelJS.Workbook();
    const hojaTildes = libroTildes.addWorksheet("D");
    hojaTildes.addRow(["Nombre", "Comuna"]);
    for (let indice = 0; indice < 60_000; indice += 1) hojaTildes.addRow([`ñandú ácido ${indice} ÑÁÉÍÓÚ`, `peña ${indice}`]);
    await libroTildes.xlsx.writeFile(rutaTildes);

    await prueba("xlsx: caracteres multibyte en el borde de un trozo llegan intactos (cero U+FFFD)", async () => {
      let filas = 0;
      let corruptas = 0;
      for await (const fila of recorrerFilasPrimeraHojaXlsx(rutaTildes)) {
        filas += 1;
        if (fila.valores.some((valor) => typeof valor === "string" && valor.includes("�"))) corruptas += 1;
      }
      assert.equal(filas, 60_001);
      assert.equal(corruptas, 0);
    });

    const rutaCsvTildes = path.join(directorio, "tildes.csv");
    await writeFile(
      rutaCsvTildes,
      ["Nombre;Comuna", ...Array.from({ length: 60_000 }, (_, indice) => `ñandú ácido ${indice} ÑÁÉÍÓÚ;peña ${indice}`)].join("\n"),
      "utf8",
    );

    await prueba("CSV: caracteres multibyte en el borde de un trozo llegan intactos (cero U+FFFD)", async () => {
      let registros = 0;
      let corruptos = 0;
      for await (const registro of recorrerRegistrosCsv(rutaCsvTildes)) {
        registros += 1;
        if (registro.campos.some((campo) => campo.includes("�"))) corruptos += 1;
      }
      assert.equal(registros, 60_001);
      assert.equal(corruptos, 0);
    });

    const { crearLectorArchivoLibreStreaming } = await import(
      "../src/modules/bioestadistica/infrastructure/lectura-archivo/LectorArchivoLibreStreamingExcelJs"
    );
    const lector = crearLectorArchivoLibreStreaming({ rutaAbsoluta: (referencia) => path.join(directorio, referencia) });

    await prueba("lector libre: encabezados como texto y filas desde la 2", async () => {
      assert.deepEqual(await lector.leerEncabezados("datos.xlsx", "XLSX"), ["Rut", "Fecha", "Monto"]);
      assert.deepEqual(await lector.leerEncabezados("utf8.csv", "CSV"), ["Año", "Comentario"]);
      const filas = await recolectar(lector.recorrerFilas("datos.xlsx", "XLSX"));
      assert.equal(filas[0]?.numeroFila, 2);
    });

    const rutaSinEncabezado = path.join(directorio, "sin-encabezado.xlsx");
    const libroSinEncabezado = new ExcelJS.Workbook();
    const hojaSinEncabezado = libroSinEncabezado.addWorksheet("Datos");
    hojaSinEncabezado.getCell("A3").value = "dato";
    await libroSinEncabezado.xlsx.writeFile(rutaSinEncabezado);

    await prueba("lector libre: xlsx con la fila 1 vacía no tiene encabezados", async () => {
      assert.deepEqual(await lector.leerEncabezados("sin-encabezado.xlsx", "XLSX"), []);
    });

    console.log("Almacén en disco");

    const { crearAlmacenArchivosDisco } = await import(
      "../src/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco"
    );
    const directorioAlmacen = path.join(directorio, "almacen");
    const almacen = crearAlmacenArchivosDisco(() => directorioAlmacen);

    function flujoDe(...partes: Uint8Array[]): ReadableStream<Uint8Array> {
      return new ReadableStream({
        start(controlador) {
          for (const parte of partes) controlador.enqueue(parte);
          controlador.close();
        },
      });
    }

    await prueba("almacén: guarda, calcula SHA-256, mueve y abre en streaming", async () => {
      const contenido = new TextEncoder().encode("a;b\n1;2\n");
      const guardado = await almacen.guardarTemporal(flujoDe(contenido.subarray(0, 3), contenido.subarray(3)), 1000);
      assert.ok(guardado.ok);
      if (!guardado.ok) return;
      assert.equal(guardado.tamanoBytes, contenido.byteLength);
      assert.equal(guardado.sha256.length, 64);
      assert.deepEqual([...guardado.primerosBytes], [...contenido]);

      const id = crypto.randomUUID();
      const referencia = await almacen.moverDefinitivo(guardado.referenciaTemporal, 2025, id, "csv");
      assert.equal(referencia, `2025/${id}.csv`);

      const abierto = await almacen.abrirLectura(referencia);
      assert.ok(abierto);
      assert.equal(abierto?.tamanoBytes, contenido.byteLength);
      const leido = await new Response(abierto?.flujo).text();
      assert.equal(leido, "a;b\n1;2\n");

      await almacen.eliminar(referencia);
      assert.equal(await almacen.abrirLectura(referencia), null);
    });

    await prueba("almacén: corta al superar el límite medido y no deja temporales", async () => {
      const resultado = await almacen.guardarTemporal(flujoDe(new Uint8Array(600), new Uint8Array(600)), 1000);
      assert.deepEqual(resultado, { ok: false, motivo: "EXCEDE_TAMANO" });
      assert.deepEqual(await readdir(path.join(directorioAlmacen, "tmp")), []);
    });

    await prueba("almacén: vacío", async () => {
      assert.deepEqual(await almacen.guardarTemporal(flujoDe(), 1000), { ok: false, motivo: "VACIO" });
    });

    await prueba("almacén: al arrancar elimina solo los .part anteriores al arranque", async () => {
      const directorioTemporal = path.join(directorioAlmacen, "tmp");
      await mkdir(directorioTemporal, { recursive: true });
      const viejo = path.join(directorioTemporal, `${crypto.randomUUID()}.part`);
      const nuevo = path.join(directorioTemporal, `${crypto.randomUUID()}.part`);
      const ajeno = path.join(directorioTemporal, "notas.txt");
      await Promise.all([writeFile(viejo, "a"), writeFile(nuevo, "b"), writeFile(ajeno, "c")]);

      const arranque = new Date();
      const antes = new Date(arranque.getTime() - 60_000);
      const despues = new Date(arranque.getTime() + 60_000);
      await Promise.all([utimes(viejo, antes, antes), utimes(nuevo, despues, despues), utimes(ajeno, antes, antes)]);

      const resultado = await almacen.eliminarTemporalesAnterioresA(arranque);
      assert.deepEqual(resultado, { eliminados: 1, fallidos: 0 });
      assert.deepEqual((await readdir(directorioTemporal)).sort(), [path.basename(nuevo), "notas.txt"].sort());
      await Promise.all([rm(nuevo), rm(ajeno)]);
    });

    await prueba("almacén: sin directorio temporal no hay nada que limpiar", async () => {
      const otro = crearAlmacenArchivosDisco(() => path.join(directorio, "no-existe"));
      assert.deepEqual(await otro.eliminarTemporalesAnterioresA(new Date()), { eliminados: 0, fallidos: 0 });
    });

    await prueba("almacén: rechaza referencias fuera del directorio base", async () => {
      await assert.rejects(() => almacen.abrirLectura("../../fuera.txt"), /fuera del almacén/);
      await assert.rejects(() => almacen.eliminar("../x"), /fuera del almacén/);
      await assert.rejects(() => almacen.moverDefinitivo("tmp/x.part", 2025, "../../x", "csv"), /inválidos/);
    });

    console.log("Concurrencia");

    await prueba("limitador: a lo más 2 tareas a la vez, todas terminan", async () => {
      const limitador = crearLimitadorConcurrencia(2);
      let enCurso = 0;
      let maximo = 0;
      const tareas = Array.from({ length: 6 }, (_, indice) =>
        limitador.ejecutar(async () => {
          enCurso += 1;
          maximo = Math.max(maximo, enCurso);
          await new Promise((resolver) => setTimeout(resolver, 10));
          enCurso -= 1;
          return indice;
        }),
      );
      assert.deepEqual(await Promise.all(tareas), [0, 1, 2, 3, 4, 5]);
      assert.equal(maximo, 2);
    });

    await prueba("lector de recepción: la revisión de encabezados corre dentro del limitador", async () => {
      const { conEncabezadosLimitados } = await import(
        "../src/modules/bioestadistica/infrastructure/lectura-archivo/LectorArchivoLibreStreamingExcelJs"
      );
      let dentroDelLimitador = 0;
      const limitadorEspia = {
        async ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
          dentroDelLimitador += 1;
          return tarea();
        },
      };
      const lectorLimitado = conEncabezadosLimitados(lector, limitadorEspia);
      assert.deepEqual(await lectorLimitado.leerEncabezados("datos.xlsx", "XLSX"), ["Rut", "Fecha", "Monto"]);
      assert.equal(dentroDelLimitador, 1);
      // `recorrerFilas` no pasa por este limitador (el procesamiento ya usa el suyo).
      await recolectar(lectorLimitado.recorrerFilas("datos.xlsx", "XLSX"));
      assert.equal(dentroDelLimitador, 1);
    });

    console.log("Procesamiento asíncrono (repositorio en memoria)");

    type EstadoFalso = {
      carga: CargaBioestadisticaParaProcesar;
      filas: FilaCargaBioestadistica[];
      lotes: number;
      activaciones: DatosActivacionCargaBioestadistica[];
      fallo: MotivoFalloCargaBioestadistica | null;
      limpiezasHuerfanas: number;
    };

    // `alInsertarLote`: simula que otro proceso actúa sobre la carga mientras se insertan lotes.
    function repositorioFalso(estado: EstadoFalso, alInsertarLote?: () => void): CargaBioestadisticaRepository {
      const parcial: Pick<
        CargaBioestadisticaRepository,
        "obtenerParaProcesar" | "insertarFilas" | "activar" | "marcarFallida" | "eliminarFilasDeCargaFallida"
      > = {
        obtenerParaProcesar: async () => estado.carga,
        insertarFilas: async (_cargaId, filas) => {
          estado.lotes += 1;
          estado.filas.push(...filas);
          alInsertarLote?.();
        },
        activar: async (datos) => {
          if (estado.carga.estado !== "PROCESANDO") return { ok: false, motivo: "NO_PROCESANDO" };
          estado.activaciones.push(datos);
          estado.carga = { ...estado.carga, estado: "ACTIVA" };
          return { ok: true };
        },
        marcarFallida: async (_cargaId, motivo) => {
          if (estado.carga.estado !== "PROCESANDO") return null;
          estado.fallo = motivo;
          estado.filas = [];
          const referencia = estado.carga.referenciaArchivo;
          estado.carga = { ...estado.carga, estado: "FALLIDA", referenciaArchivo: null };
          return { id: estado.carga.id, referenciaArchivo: referencia };
        },
        // Misma condición que el repositorio Prisma: solo si la cabecera está FALLIDA.
        eliminarFilasDeCargaFallida: async () => {
          estado.limpiezasHuerfanas += 1;
          if (estado.carga.estado !== "FALLIDA") return 0;
          const cantidad = estado.filas.length;
          estado.filas = [];
          return cantidad;
        },
      };
      // El caso de uso solo usa estos cinco métodos.
      return parcial as CargaBioestadisticaRepository;
    }

    const eliminados: string[] = [];
    const almacenFalso = { eliminar: async (referencia: string) => void eliminados.push(referencia) } as unknown as AlmacenArchivos;

    function estadoInicial(referencia: string, formato: "CSV" | "XLSX", encabezados: string[]): EstadoFalso {
      return {
        carga: {
          id: "c1",
          usuarioId: "u1",
          anio: 2025,
          tipoArchivo: "DEFUNCIONES",
          estado: "PROCESANDO",
          formato,
          referenciaArchivo: referencia,
          encabezados,
        },
        filas: [],
        lotes: 0,
        activaciones: [],
        fallo: null,
        limpiezasHuerfanas: 0,
      };
    }

    const filasGrandes = TAMANO_LOTE_FILAS_BIOESTADISTICA + 3;
    const lineas = ["Rut;Fecha;Nota", ...Array.from({ length: filasGrandes }, (_, i) => `${i}-K;2025-01-0${(i % 9) + 1};`)];
    lineas.splice(5, 0, ";;");
    await writeFile(path.join(directorio, "grande.csv"), `${lineas.join("\n")}\n`);

    await prueba("procesa por lotes, omite filas vacías conservando el número real y activa", async () => {
      const estado = estadoInicial("grande.csv", "CSV", ["Rut", "Fecha", "Nota"]);
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "ACTIVA", cantidadFilasDatos: filasGrandes });
      assert.equal(estado.lotes, 2);
      assert.equal(estado.filas.length, filasGrandes);
      assert.deepEqual(estado.filas[0], { numeroFila: 2, valores: { Rut: "0-K", Fecha: "2025-01-01", Nota: null } });
      // La línea vacía (registro 6) se omitió: el siguiente conserva su número real.
      assert.ok(!estado.filas.some((fila) => fila.numeroFila === 6));
      assert.ok(estado.filas.some((fila) => fila.numeroFila === 7));
      assert.equal(estado.activaciones[0]?.cantidadFilasDatos, filasGrandes);
    });

    await prueba("xlsx: fechas a ISO y activación con el contexto de reemplazo", async () => {
      const estado = estadoInicial("datos.xlsx", "XLSX", ["Rut", "Fecha", "Monto"]);
      const reemplazo = { cargaAnteriorId: "anterior", solicitudId: "s1" };
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "ACTIVA", cantidadFilasDatos: 2 });
      assert.deepEqual(estado.filas[0]?.valores, { Rut: "1-9", Fecha: "2025-05-06T00:00:00.000Z", Monto: 10.5 });
      assert.equal(estado.filas[1]?.numeroFila, 4);
      assert.deepEqual(estado.activaciones[0]?.reemplazo, reemplazo);
    });

    await writeFile(path.join(directorio, "solo-encabezado.csv"), "a,b\n\n");

    await prueba("sin filas de datos: FALLIDA SIN_FILAS_DATOS y elimina el archivo", async () => {
      const estado = estadoInicial("solo-encabezado.csv", "CSV", ["a", "b"]);
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "FALLIDA", motivo: "SIN_FILAS_DATOS" });
      assert.ok(eliminados.includes("solo-encabezado.csv"));
    });

    await writeFile(path.join(directorio, "corrupto.xlsx"), Buffer.from([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9]));

    await prueba("archivo ilegible: FALLIDA ARCHIVO_ILEGIBLE", async () => {
      const estado = estadoInicial("corrupto.xlsx", "XLSX", ["a"]);
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "FALLIDA", motivo: "ARCHIVO_ILEGIBLE" });
    });

    await prueba("ya no PROCESANDO: se omite sin tocar nada", async () => {
      const estado = estadoInicial("grande.csv", "CSV", ["Rut"]);
      estado.carga = { ...estado.carga, estado: "ACTIVA" };
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "OMITIDA" });
      assert.equal(estado.lotes, 0);
    });

    // Otro proceso la marca FALLIDA (vencimiento) tras el primer lote y borra lo que había; esta
    // ejecución sigue insertando el resto y su activación devuelve NO_PROCESANDO.
    function marcarFallidaPorOtroProceso(estado: EstadoFalso): () => void {
      return () => {
        if (estado.lotes !== 1) return;
        estado.carga = { ...estado.carga, estado: "FALLIDA", referenciaArchivo: null };
        estado.filas = [];
      };
    }

    await prueba("NO_PROCESANDO al activar: OMITIDA y borra las filas huérfanas insertadas después", async () => {
      const estado = estadoInicial("grande.csv", "CSV", ["Rut", "Fecha", "Nota"]);
      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado, marcarFallidaPorOtroProceso(estado)),
        lector,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "OMITIDA" });
      assert.equal(estado.lotes, 2);
      assert.equal(estado.limpiezasHuerfanas, 1);
      assert.equal(estado.filas.length, 0);
    });

    await prueba("fallo de negocio con la carga ya FALLIDA por otro proceso: también limpia huérfanas", async () => {
      const filasConTope = TAMANO_LOTE_FILAS_BIOESTADISTICA * 2 + 1;
      const contenidoTope = ["a", ...Array.from({ length: filasConTope }, (_, i) => String(i))].join("\n");
      await writeFile(path.join(directorio, "huerfanas.csv"), `${contenidoTope}\n`);
      const estado = estadoInicial("huerfanas.csv", "CSV", ["a"]);

      // El tope real (2 millones) no es práctico en una prueba: se fuerza el fallo de negocio con un
      // lector que, tras dos lotes, entrega una fila que lo provoca (archivo ilegible).
      const lectorQueFalla = {
        ...lector,
        async *recorrerFilas(referencia: string, formato: "CSV" | "XLSX") {
          let contador = 0;
          for await (const fila of lector.recorrerFilas(referencia, formato)) {
            contador += 1;
            if (contador > TAMANO_LOTE_FILAS_BIOESTADISTICA * 2) throw new Error("archivo corrupto");
            yield fila;
          }
        },
      };

      const resultado = await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado, marcarFallidaPorOtroProceso(estado)),
        lector: lectorQueFalla,
        almacen: almacenFalso,
      });
      assert.deepEqual(resultado, { estado: "OMITIDA" });
      assert.equal(estado.limpiezasHuerfanas, 1);
      assert.equal(estado.filas.length, 0);
    });

    await prueba("activación exitosa: nunca intenta limpiar filas", async () => {
      const estado = estadoInicial("grande.csv", "CSV", ["Rut", "Fecha", "Nota"]);
      await procesarCargaBioestadistica("c1", { reemplazo: null }, {
        repositorio: repositorioFalso(estado),
        lector,
        almacen: almacenFalso,
      });
      assert.equal(estado.limpiezasHuerfanas, 0);
      assert.equal(estado.filas.length, filasGrandes);
    });
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
