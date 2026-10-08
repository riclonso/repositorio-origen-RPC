// RF-38: integración de las cargas del notificador en disco, con los repositorios Prisma
// reales, el almacén real (en un directorio temporal) y el validador en streaming real.
//
//  - Recepción: PROCESANDO + archivo en disco + SHA-256; rechazos por tamaño (declarado y medido),
//    firma y extensión; las reglas de negocio rechazan ANTES de leer el cuerpo; un fallo al crear la
//    carga no deja archivo; dos subidas simultáneas → una EN_PROCESO.
//  - Procesamiento: CON_ERRORES / PENDIENTE_VISTO_BUENO / ARCHIVO_NO_PROCESADO; idempotencia.
//  - Huérfanos: al arrancar y por expiración (2 h) en la recepción.
//  - Ciclo: finalizar, aprobar (cabecera, ninguna fila en `carga_archivo_publicada_fila`), rechazar.
//  - Descargas: ajena, sin finalizar (original), finalizada (con columna), original byte a byte,
//    archivo ausente y carga anterior al disco (binario en la base).
//
// Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE con las migraciones aplicadas:
//
//   CARGAS_DISCO_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/cargas-disco.integration.ts
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function flujoDe(contenido: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controlador) {
      controlador.enqueue(new Uint8Array(contenido));
      controlador.close();
    },
  });
}

// Un cuerpo que falla si alguien lo lee: prueba que las reglas de negocio rechazan antes.
function cuerpoIntocable(): { cuerpo: ReadableStream<Uint8Array>; leido: () => boolean } {
  let leido = false;
  return {
    // `highWaterMark: 0`: sin él, el flujo llama a `pull` al construirse para llenar su cola.
    cuerpo: new ReadableStream(
      {
        pull() {
          leido = true;
          throw new Error("no debía leerse");
        },
      },
      { highWaterMark: 0 },
    ),
    leido: () => leido,
  };
}

// Cuerpo enorme generado al vuelo (sin memoria): `bytes` ceros en trozos de 1 MB.
function cuerpoGigante(bytes: number): ReadableStream<Uint8Array> {
  let enviados = 0;
  const trozo = new Uint8Array(1024 * 1024);
  return new ReadableStream({
    pull(controlador) {
      if (enviados >= bytes) {
        controlador.close();
        return;
      }
      enviados += trozo.byteLength;
      controlador.enqueue(trozo);
    },
  });
}

async function xlsx(filas: (string | number | null)[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("D");
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.CARGAS_DISCO_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  const directorio = await mkdtemp(path.join(tmpdir(), "cargas-disco-"));
  process.env.DIRECTORIO_ARCHIVOS_CARGAS = directorio;

  const { prisma } = await import("../src/infrastructure/database/prisma");
  const { prismaCargaArchivoRepository: repositorio } = await import(
    "../src/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository"
  );
  const { prismaFormatoExcelRepository } = await import("../src/modules/formatos-excel/infrastructure/repositories/PrismaFormatoExcelRepository");
  const { prismaVentanaCargaRepository } = await import("../src/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository");
  const { prismaSolicitudReemplazoCargaRepository } = await import(
    "../src/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository"
  );
  const { almacenArchivosCargas: almacen } = await import("../src/modules/reporte-excel/infrastructure/almacenamiento/almacenArchivosCargas");
  const { crearValidadorArchivoReporteStreaming } = await import(
    "../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming"
  );
  const { crearGeneradorDescargaCargaExcelJs } = await import(
    "../src/modules/reporte-excel/infrastructure/generacion-excel/GeneradorDescargaCargaExcelJs"
  );
  const { recibirArchivoCarga } = await import("../src/modules/reporte-excel/application/use-cases/RecibirArchivoCarga");
  const { procesarCargaArchivo } = await import("../src/modules/reporte-excel/application/use-cases/ProcesarCargaArchivo");
  const { marcarProcesamientosCargaInterrumpidos } = await import(
    "../src/modules/reporte-excel/application/use-cases/MarcarProcesamientosCargaInterrumpidos"
  );
  const { finalizarYEnviarCarga } = await import("../src/modules/reporte-excel/application/use-cases/FinalizarYEnviarCarga");
  const { darVistoBueno } = await import("../src/modules/reporte-excel/application/use-cases/DarVistoBueno");
  const { rechazarCarga } = await import("../src/modules/reporte-excel/application/use-cases/RechazarCarga");
  const { obtenerArchivoCargaParaDescarga } = await import(
    "../src/modules/reporte-excel/application/use-cases/ObtenerArchivoCargaParaDescarga"
  );
  const { tipoContenidoDesdePrimerosBytes } = await import("../src/app/api/formatos-excel/_lib/http");

  const validador = crearValidadorArchivoReporteStreaming(almacen);
  const generador = crearGeneradorDescargaCargaExcelJs(almacen);
  const marca = randomUUID().slice(0, 8);

  async function crearUsuario(perfilCodigo: string): Promise<string> {
    const id = randomUUID();
    await prisma.usuario.create({
      data: { id, nombres: "Prueba", apellidos: `Disco ${marca}`, rut: id, email: `${id}@example.invalid`, username: id, perfilCodigo },
    });
    return id;
  }

  const formato = await prisma.formatoExcel.create({
    data: {
      nombre: `Disco-${marca}`,
      nombreArchivoPlantilla: "p.xlsx",
      tipoContenidoPlantilla: TIPO_XLSX,
      tipoArchivo: "EXCEL",
      contenidoPlantilla: Uint8Array.from(Buffer.from("x")),
      columnas: {
        create: [
          { orden: 1, nombre: "Nombre", requerida: true, tipoDato: "TEXTO" },
          { orden: 2, nombre: "Edad", requerida: false, tipoDato: "ENTERO" },
        ],
      },
    },
    select: { id: true },
  });
  const revisorId = await crearUsuario("REVISOR_REPOSITORIO");
  const notificadorId = await crearUsuario("NOTIFICADOR_RPC");
  const otroNotificadorId = await crearUsuario("NOTIFICADOR_RPC");
  await prisma.usuarioFormatoExcel.createMany({
    data: [
      { usuarioId: notificadorId, formatoExcelId: formato.id },
      { usuarioId: otroNotificadorId, formatoExcelId: formato.id },
    ],
  });

  let anioSiguiente = 7000 + Math.floor(Math.random() * 500) * 10;
  async function crearVentana(): Promise<{ id: string; anio: number }> {
    const anio = anioSiguiente++;
    const ventana = await prisma.ventanaCarga.create({
      data: {
        anio,
        fechaApertura: new Date("2000-01-01T00:00:00Z"),
        fechaVencimiento: new Date("2100-12-31T23:59:00Z"),
        formatoExcelId: formato.id,
        creadoPorId: revisorId,
        plantillaAlerta: "<p>x</p>",
        publicada: true,
      },
      select: { id: true },
    });
    return { id: ventana.id, anio };
  }

  const dependenciasRecepcion = {
    repositorio,
    repositorioFormatosExcel: prismaFormatoExcelRepository,
    repositorioVentanasCarga: prismaVentanaCargaRepository,
    repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository,
    almacen,
    detectarTipoContenido: tipoContenidoDesdePrimerosBytes,
  };
  const dependenciasProceso = {
    repositorio,
    repositorioFormatosExcel: prismaFormatoExcelRepository,
    repositorioVentanasCarga: prismaVentanaCargaRepository,
    validador,
  };

  function recibir(anio: number, cuerpo: ReadableStream<Uint8Array> | null, opciones: { nombre?: string; usuarioId?: string; tamanoDeclarado?: number | null } = {}) {
    return recibirArchivoCarga(
      {
        usuarioId: opciones.usuarioId ?? notificadorId,
        formatoExcelId: formato.id,
        anio,
        nombreArchivoOriginal: opciones.nombre ?? "Año ñandú.xlsx",
        tamanoDeclarado: opciones.tamanoDeclarado ?? null,
        cuerpo,
        ahora: new Date(),
      },
      dependenciasRecepcion,
    );
  }

  async function archivosDefinitivos(): Promise<string[]> {
    const entradas = await readdir(directorio, { recursive: true });
    return entradas.filter((entrada) => entrada.endsWith(".xlsx"));
  }

  try {
    const valido = await xlsx([["Nombre", "Edad"], ["Ana", 30], ["Luis", 40]]);
    const conErrores = await xlsx([["Nombre", "Edad"], [null, "treinta"]]);

    // --- Recepción ---
    const ventana = await crearVentana();
    const recibida = await recibir(ventana.anio, flujoDe(valido));
    assert.ok(recibida.ok);
    if (!recibida.ok) return;
    assert.equal(recibida.carga.estado, "PROCESANDO");
    const fila = await prisma.cargaArchivo.findUniqueOrThrow({ where: { id: recibida.carga.id } });
    assert.equal(fila.contenidoArchivo, null, "las cargas nuevas no guardan Bytes");
    assert.equal(fila.rutaArchivo, `${ventana.anio}/${recibida.carga.id}.xlsx`);
    assert.equal(fila.tamanoBytes, valido.length);
    assert.equal(fila.sha256, createHash("sha256").update(valido).digest("hex"));
    assert.deepEqual(await readFile(path.join(directorio, fila.rutaArchivo ?? "")), valido);
    console.log("OK: recepción → PROCESANDO, archivo en disco con tamaño y SHA-256 reales, sin Bytes");

    const enProceso = await recibir(ventana.anio, flujoDe(valido));
    assert.deepEqual(enProceso, { ok: false, motivo: "EN_PROCESO" });
    console.log("OK: segunda subida con una validación en curso → EN_PROCESO");

    // --- Procesamiento ---
    const procesada = await procesarCargaArchivo(recibida.carga.id, dependenciasProceso);
    assert.equal(procesada.estado, "PROCESADA");
    const tras = await repositorio.obtenerPorId(recibida.carga.id);
    assert.equal(tras?.estado, "PENDIENTE_VISTO_BUENO");
    assert.equal(tras?.cantidadFilasDatos, 2);
    assert.deepEqual(await procesarCargaArchivo(recibida.carga.id, dependenciasProceso), { estado: "OMITIDA" });
    console.log("OK: procesamiento → PENDIENTE_VISTO_BUENO; repetirlo es idempotente (OMITIDA)");

    const ventanaErrores = await crearVentana();
    const recibidaErrores = await recibir(ventanaErrores.anio, flujoDe(conErrores));
    assert.ok(recibidaErrores.ok);
    if (!recibidaErrores.ok) return;
    await procesarCargaArchivo(recibidaErrores.carga.id, dependenciasProceso);
    const conErroresBd = await repositorio.obtenerPorId(recibidaErrores.carga.id);
    assert.equal(conErroresBd?.estado, "CON_ERRORES");
    assert.deepEqual(conErroresBd?.errores.map((error) => error.tipoError).sort(), ["TIPO_DATO_INVALIDO", "VALOR_REQUERIDO_VACIO"]);
    console.log("OK: procesamiento → CON_ERRORES con sus errores");

    // ZIP con firma válida pero contenido corrupto.
    const corrupto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 7)]);
    const ventanaCorrupta = await crearVentana();
    const recibidaCorrupta = await recibir(ventanaCorrupta.anio, flujoDe(corrupto));
    assert.ok(recibidaCorrupta.ok);
    if (!recibidaCorrupta.ok) return;
    const noProcesada = await procesarCargaArchivo(recibidaCorrupta.carga.id, dependenciasProceso);
    assert.equal(noProcesada.estado, "NO_PROCESADA");
    const corruptaBd = await repositorio.obtenerPorId(recibidaCorrupta.carga.id);
    assert.equal(corruptaBd?.estado, "CON_ERRORES");
    assert.deepEqual(corruptaBd?.errores.map((error) => error.tipoError), ["ARCHIVO_NO_PROCESADO"]);
    console.log("OK: ZIP corrupto → CON_ERRORES con ARCHIVO_NO_PROCESADO");

    // --- Rechazos de la recepción ---
    const ventanaRechazos = await crearVentana();
    const antes = (await archivosDefinitivos()).length;

    const intocable = cuerpoIntocable();
    const ajeno = await recibirArchivoCarga(
      { usuarioId: revisorId, formatoExcelId: formato.id, anio: ventanaRechazos.anio, nombreArchivoOriginal: "x.xlsx", tamanoDeclarado: null, cuerpo: intocable.cuerpo, ahora: new Date() },
      dependenciasRecepcion,
    );
    assert.deepEqual(ajeno, { ok: false, motivo: "FORMATO_NO_ASIGNADO" });
    assert.equal(intocable.leido(), false, "el cuerpo no se lee si el formato no está asignado");

    const intocableTamano = cuerpoIntocable();
    assert.deepEqual(await recibir(ventanaRechazos.anio, intocableTamano.cuerpo, { tamanoDeclarado: 101 * 1024 * 1024 }), {
      ok: false,
      motivo: "ARCHIVO_DEMASIADO_GRANDE",
    });
    assert.equal(intocableTamano.leido(), false);

    const intocableCsv = cuerpoIntocable();
    assert.deepEqual(await recibir(ventanaRechazos.anio, intocableCsv.cuerpo, { nombre: "datos.csv" }), { ok: false, motivo: "ARCHIVO_NO_EXCEL" });
    assert.equal(intocableCsv.leido(), false);

    assert.deepEqual(await recibir(ventanaRechazos.anio, flujoDe(Buffer.from("no es zip"))), { ok: false, motivo: "ARCHIVO_NO_COINCIDE" });
    assert.deepEqual(await recibir(ventanaRechazos.anio, cuerpoGigante(101 * 1024 * 1024)), { ok: false, motivo: "ARCHIVO_DEMASIADO_GRANDE" });
    assert.deepEqual(await recibir(ventanaRechazos.anio, flujoDe(Buffer.alloc(0))), { ok: false, motivo: "ARCHIVO_VACIO" });

    const fallaCrear = { ...dependenciasRecepcion, repositorio: { ...repositorio, crearProcesando: async () => { throw new Error("falla simulada"); } } };
    await assert.rejects(() =>
      recibirArchivoCarga(
        { usuarioId: notificadorId, formatoExcelId: formato.id, anio: ventanaRechazos.anio, nombreArchivoOriginal: "x.xlsx", tamanoDeclarado: null, cuerpo: flujoDe(valido), ahora: new Date() },
        fallaCrear,
      ),
    );
    assert.equal((await archivosDefinitivos()).length, antes, "ningún rechazo ni falla deja archivos");
    assert.deepEqual(await readdir(path.join(directorio, "tmp")), [], "ni temporales");
    console.log("OK: rechazos de negocio antes de leer el cuerpo; tamaño declarado y medido, firma, extensión, vacío; una falla al crear no deja archivo");

    // --- Concurrencia: dos subidas simultáneas de la misma combinación ---
    const ventanaConcurrente = await crearVentana();
    const simultaneas = await Promise.all([recibir(ventanaConcurrente.anio, flujoDe(valido)), recibir(ventanaConcurrente.anio, flujoDe(valido))]);
    assert.equal(simultaneas.filter((resultado) => resultado.ok).length, 1);
    assert.deepEqual(simultaneas.find((resultado) => !resultado.ok), { ok: false, motivo: "EN_PROCESO" });
    console.log("OK: dos subidas simultáneas → una EN_PROCESO (chequeo previo o índice parcial)");

    // --- Huérfanos ---
    const enCurso = simultaneas.find((resultado) => resultado.ok);
    assert.ok(enCurso?.ok);
    if (!enCurso?.ok) return;
    await prisma.cargaArchivo.update({ where: { id: enCurso.carga.id }, data: { createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
    const trasExpiracion = await recibir(ventanaConcurrente.anio, flujoDe(valido));
    assert.ok(trasExpiracion.ok, "un PROCESANDO de más de 2 horas no bloquea la subida");
    const expirada = await repositorio.obtenerPorId(enCurso.carga.id);
    assert.equal(expirada?.estado, "CON_ERRORES");
    assert.equal(expirada?.errores[0]?.tipoError, "ARCHIVO_NO_PROCESADO");

    const liberadas = await marcarProcesamientosCargaInterrumpidos(new Date(Date.now() + 1000), { repositorio });
    assert.ok(trasExpiracion.ok && liberadas.includes(trasExpiracion.carga.id));
    assert.equal((await repositorio.obtenerPorId(trasExpiracion.carga.id))?.estado, "CON_ERRORES");
    console.log("OK: huérfanos liberados por expiración en la recepción y al arrancar");

    // --- Descargas antes de finalizar: original ---
    const sinFinalizar = await obtenerArchivoCargaParaDescarga(
      { cargaId: recibida.carga.id, usuarioId: notificadorId, modo: "notificacion" },
      { repositorio, almacen, generador },
    );
    assert.ok(sinFinalizar.ok && !sinFinalizar.archivo.conFechaNotificacion);
    assert.ok(sinFinalizar.ok && sinFinalizar.archivo.tamanoBytes === valido.length);
    const ajena = await obtenerArchivoCargaParaDescarga(
      { cargaId: recibida.carga.id, usuarioId: otroNotificadorId, modo: "notificacion" },
      { repositorio, almacen, generador },
    );
    assert.deepEqual(ajena, { ok: false, motivo: "NO_ENCONTRADO" });
    const revisorAntes = await obtenerArchivoCargaParaDescarga({ cargaId: recibida.carga.id, usuarioId: null, modo: "notificacion" }, { repositorio, almacen, generador });
    assert.deepEqual(revisorAntes, { ok: false, motivo: "NO_ENCONTRADO" }, "sin finalizar no es accesible para el revisor");
    if (sinFinalizar.ok) await sinFinalizar.archivo.flujo.cancel();
    console.log("OK: descarga propia sin finalizar → original; ajena y revisor sin finalizar → 404");

    // --- Ciclo: finalizar y aprobar sin filas publicadas ---
    const finalizada = await finalizarYEnviarCarga(recibida.carga.id, notificadorId, {
      repositorio,
      repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository,
      repositorioVentanasCarga: prismaVentanaCargaRepository,
    });
    assert.ok(finalizada.ok);

    const conColumna = await obtenerArchivoCargaParaDescarga({ cargaId: recibida.carga.id, usuarioId: null, modo: "notificacion" }, { repositorio, almacen, generador });
    assert.ok(conColumna.ok && conColumna.archivo.conFechaNotificacion);
    if (conColumna.ok) {
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(Buffer.from(await new Response(conColumna.archivo.flujo).arrayBuffer()) as unknown as ArrayBuffer);
      assert.equal(libro.worksheets[0].getCell("C1").value, "Fecha y hora de notificación");
      assert.ok(libro.worksheets[0].getCell("C2").value instanceof Date);
      assert.equal(conColumna.archivo.nombreArchivo, "Año ñandú.xlsx");
    }
    const original = await obtenerArchivoCargaParaDescarga({ cargaId: recibida.carga.id, usuarioId: null, modo: "original" }, { repositorio, almacen, generador });
    assert.ok(original.ok);
    if (original.ok) {
      assert.equal(original.archivo.tamanoBytes, valido.length);
      assert.deepEqual(Buffer.from(await new Response(original.archivo.flujo).arrayBuffer()), valido, "original byte a byte");
    }

    const aprobada = await darVistoBueno(recibida.carga.id, revisorId, { repositorio, repositorioSolicitudesReemplazo: prismaSolicitudReemplazoCargaRepository });
    assert.ok(aprobada.ok);
    const publicacion = await prisma.cargaArchivoPublicada.findUniqueOrThrow({ where: { cargaArchivoId: recibida.carga.id }, select: { id: true } });
    assert.equal(await prisma.cargaArchivoPublicadaFila.count({ where: { cargaArchivoPublicadaId: publicacion.id } }), 0);
    console.log("OK: finalizada → descarga con columna y original byte a byte; aprobar crea la cabecera sin filas");

    const rechazada = await rechazarCarga(recibida.carga.id, { rechazadoPorId: revisorId, motivo: "prueba" }, { repositorio });
    assert.ok(rechazada.ok);
    const propiaRechazada = await obtenerArchivoCargaParaDescarga({ cargaId: recibida.carga.id, usuarioId: notificadorId, modo: "notificacion" }, { repositorio, almacen, generador });
    assert.ok(propiaRechazada.ok && propiaRechazada.archivo.conFechaNotificacion);
    if (propiaRechazada.ok) await propiaRechazada.archivo.flujo.cancel();
    console.log("OK: rechazar; la rechazada se descarga con columna por su dueño");

    // --- Archivo ausente ---
    await rm(path.join(directorio, fila.rutaArchivo ?? ""));
    assert.deepEqual(
      await obtenerArchivoCargaParaDescarga({ cargaId: recibida.carga.id, usuarioId: notificadorId, modo: "notificacion" }, { repositorio, almacen, generador }),
      { ok: false, motivo: "ARCHIVO_AUSENTE" },
    );
    console.log("OK: archivo ausente en disco → ARCHIVO_AUSENTE (404 + errores.txt)");

    // --- Carga anterior al disco (binario en la base, soporte permanente) ---
    const ventanaAntigua = await crearVentana();
    const antigua = await prisma.cargaArchivo.create({
      data: {
        formatoExcelId: formato.id,
        ventanaCargaId: ventanaAntigua.id,
        usuarioId: notificadorId,
        nombreArchivoOriginal: "antigua.xlsx",
        tipoContenidoArchivo: TIPO_XLSX,
        contenidoArchivo: Uint8Array.from(valido),
        cantidadFilasDatos: 2,
        cantidadErrores: 0,
        estado: "APROBADA",
        vistoBuenoEn: new Date("2025-01-15T16:04:05Z"),
      },
      select: { id: true },
    });
    const antiguaColumna = await obtenerArchivoCargaParaDescarga({ cargaId: antigua.id, usuarioId: null, modo: "notificacion" }, { repositorio, almacen, generador });
    assert.ok(antiguaColumna.ok && antiguaColumna.archivo.conFechaNotificacion);
    if (antiguaColumna.ok) {
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(Buffer.from(await new Response(antiguaColumna.archivo.flujo).arrayBuffer()) as unknown as ArrayBuffer);
      assert.equal((libro.worksheets[0].getCell("C2").value as Date).toISOString(), "2025-01-15T13:04:05.000Z", "vistoBuenoEn como respaldo, hora de Chile");
    }
    const antiguaOriginal = await obtenerArchivoCargaParaDescarga({ cargaId: antigua.id, usuarioId: null, modo: "original" }, { repositorio, almacen, generador });
    assert.ok(antiguaOriginal.ok);
    if (antiguaOriginal.ok) assert.deepEqual(Buffer.from(await new Response(antiguaOriginal.archivo.flujo).arrayBuffer()), valido);
    console.log("OK: carga anterior al disco → con columna (respaldo vistoBuenoEn) y original desde la base");

    // --- CHECK: una carga sin binario en ninguna parte se rechaza ---
    await assert.rejects(() =>
      prisma.cargaArchivo.create({
        data: { formatoExcelId: formato.id, ventanaCargaId: ventanaAntigua.id, usuarioId: notificadorId, nombreArchivoOriginal: "x", tipoContenidoArchivo: TIPO_XLSX, cantidadFilasDatos: 0, cantidadErrores: 0, estado: "CON_ERRORES" },
      }),
    );
    console.log("OK: CHECK carga_archivo_binario_presente");

    console.log("Todas las pruebas de cargas en disco pasaron");
  } finally {
    await prisma.$disconnect();
    await rm(directorio, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
