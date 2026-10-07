// RF-37 (perfil Bioestadística), integración con PostgreSQL y disco reales: recepción →
// procesamiento → ACTIVA, rechazos de recepción, reemplazo con el año cerrado, consumo condicional
// de la solicitud, EN_PROCESO, fallos (filas y archivo limpiados, la anterior sigue ACTIVA),
// huérfanos al arrancar, descarga ajena, ventanas archivadas o eliminadas sin efecto sobre las
// cargas y copia de `diasVigencia` con el máximo del año.
//
// Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE (su nombre debe empezar con
// `prueba_`) con las migraciones aplicadas. Nunca contra la base de desarrollo ni producción:
//
//   BIOESTADISTICA_TEST_DATABASE=true DATABASE_URL=postgres://.../prueba_xxx AUTH_SECRET=... \
//     npx tsx tests/bioestadistica.integration.ts
//
// Los archivos se guardan en un directorio temporal propio que se elimina al terminar.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { TipoArchivoBioestadistica } from "../src/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";
import type { ContextoProcesamientoBioestadistica } from "../src/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica";

function verificarBaseDesechable(): void {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.ok(url.pathname.slice(1).startsWith("prueba_"), "El nombre de la BD desechable debe empezar con prueba_");
  assert.equal(process.env.BIOESTADISTICA_TEST_DATABASE, "true", "Requiere autorización de BD desechable");
}

// La verificación corre ANTES de cargar cualquier módulo que abra una conexión.
verificarBaseDesechable();

async function main(): Promise<void> {
  const { prisma } = await import("../src/infrastructure/database/prisma");
  const { prismaCargaBioestadisticaRepository: repositorioCargas } = await import(
    "../src/modules/bioestadistica/infrastructure/repositories/PrismaCargaBioestadisticaRepository"
  );
  const { prismaSolicitudReemplazoBioestadisticaRepository: repositorioSolicitudes } = await import(
    "../src/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository"
  );
  const { prismaVentanaCargaRepository: repositorioVentanas } = await import(
    "../src/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository"
  );
  const { prismaUsuarioRepository } = await import("../src/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository");
  const { crearAlmacenArchivosDisco } = await import(
    "../src/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco"
  );
  const { crearLectorArchivoLibreStreaming } = await import(
    "../src/modules/bioestadistica/infrastructure/lectura-archivo/LectorArchivoLibreStreamingExcelJs"
  );
  const { recibirArchivoBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica"
  );
  const { procesarCargaBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/ProcesarCargaBioestadistica"
  );
  const { solicitarReemplazoBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/SolicitarReemplazoBioestadistica"
  );
  const { revisarSolicitudReemplazoBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/RevisarSolicitudReemplazoBioestadistica"
  );
  const { marcarProcesamientosHuerfanosComoFallidos } = await import(
    "../src/modules/bioestadistica/application/use-cases/MarcarProcesamientosHuerfanosComoFallidos"
  );
  const { obtenerArchivoCargaBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/ObtenerArchivoCargaBioestadistica"
  );
  const { listarCargasBioestadisticaAdministracion } = await import(
    "../src/modules/bioestadistica/application/use-cases/ListarCargasBioestadisticaAdministracion"
  );
  const { obtenerPanelBioestadistica } = await import(
    "../src/modules/bioestadistica/application/use-cases/ObtenerPanelBioestadistica"
  );
  const { EXPRESION_TIENE_HISTORIAL } = await import(
    "../src/modules/usuarios/infrastructure/repositories/relacionesHistorialUsuario"
  );

  const directorio = await mkdtemp(path.join(tmpdir(), "bioestadistica-integracion-"));
  const almacen = crearAlmacenArchivosDisco(() => directorio);
  const lector = crearLectorArchivoLibreStreaming(almacen);

  const dependenciasRecepcion = {
    repositorioCargas,
    repositorioSolicitudes,
    repositorioVentanas,
    consultaUsuarios: prismaUsuarioRepository,
    almacen,
    lector,
  };

  let ejecutados = 0;
  async function escenario(nombre: string, cuerpo: () => Promise<void>): Promise<void> {
    await cuerpo();
    ejecutados += 1;
    console.log(`  ok  ${nombre}`);
  }

  // --- Datos base ---
  const tipoEstablecimiento = await prisma.tipoEstablecimiento.create({
    data: { nombre: "Hospital prueba", nombreNormalizado: `hospital-prueba-${crypto.randomUUID()}` },
  });
  const establecimiento = await prisma.establecimiento.create({
    data: { rut: `${Date.now()}-K`, nombre: "Hospital de prueba", direccion: "Calle 1", tipoId: tipoEstablecimiento.id },
  });

  async function crearUsuario(perfilCodigo: string, conEstablecimiento = true): Promise<string> {
    const id = crypto.randomUUID();
    await prisma.usuario.create({
      data: {
        id,
        nombres: "Prueba",
        apellidos: perfilCodigo,
        rut: id,
        email: `${id}@example.invalid`,
        username: id,
        perfilCodigo,
        ...(conEstablecimiento ? { establecimientoId: establecimiento.id } : {}),
      },
    });
    return id;
  }

  const revisorId = await crearUsuario("REVISOR_REPOSITORIO", false);
  const bioId = await crearUsuario("BIOESTADISTICA");
  const otroBioId = await crearUsuario("BIOESTADISTICA");
  const sinEstablecimientoId = await crearUsuario("BIOESTADISTICA", false);

  async function crearFormato(nombre: string): Promise<string> {
    const formato = await prisma.formatoExcel.create({
      data: {
        nombre: `${nombre}-${crypto.randomUUID().slice(0, 8)}`,
        nombreArchivoPlantilla: "plantilla.xlsx",
        tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        tipoArchivo: "EXCEL",
        contenidoPlantilla: Uint8Array.from(Buffer.from("x")),
      },
      select: { id: true },
    });
    return formato.id;
  }

  const formatoA = await crearFormato("A");
  const formatoB = await crearFormato("B");
  const formatoC = await crearFormato("C");

  type OpcionesVentana = { abierta?: boolean; dias?: number; archivada?: boolean; publicada?: boolean; formatoId?: string };

  async function crearVentana(anio: number, opciones: OpcionesVentana = {}): Promise<string> {
    const abierta = opciones.abierta ?? true;
    const ventana = await prisma.ventanaCarga.create({
      data: {
        anio,
        fechaApertura: new Date("2000-01-01T00:00:00Z"),
        // Cerrada = venció hace tiempo; abierta = vence en el futuro lejano.
        fechaVencimiento: abierta ? new Date("2100-12-31T23:59:59.999Z") : new Date("2001-01-01T23:59:59.999Z"),
        formatoExcelId: opciones.formatoId ?? formatoA,
        creadoPorId: revisorId,
        plantillaAlerta: "<p>prueba</p>",
        publicada: opciones.publicada ?? true,
        archivada: opciones.archivada ?? false,
        diasVigenciaReemplazo: opciones.dias ?? 7,
      },
      select: { id: true },
    });
    return ventana.id;
  }

  function cuerpoDe(texto: string): ReadableStream<Uint8Array> {
    return new Response(texto).body as ReadableStream<Uint8Array>;
  }

  const CSV_OK = "Rut;Fecha;Diagnóstico\n1-9;2025-01-01;C50\n2-7;2025-02-01;C61\n\n3-5;2025-03-01;\n";

  async function recibir(
    usuarioId: string,
    anio: number,
    tipoArchivo: TipoArchivoBioestadistica,
    contenido: string,
    nombre = "datos.csv",
  ) {
    return recibirArchivoBioestadistica(
      {
        usuarioId,
        anio,
        tipoArchivo,
        nombreArchivoOriginal: nombre,
        tamanoDeclarado: Buffer.byteLength(contenido),
        cuerpo: cuerpoDe(contenido),
        ahora: new Date(),
      },
      dependenciasRecepcion,
    );
  }

  async function procesar(cargaId: string, contexto: ContextoProcesamientoBioestadistica) {
    return procesarCargaBioestadistica(cargaId, contexto, { repositorio: repositorioCargas, lector, almacen });
  }

  async function subirYProcesar(usuarioId: string, anio: number, tipo: TipoArchivoBioestadistica, contenido = CSV_OK) {
    const recibido = await recibir(usuarioId, anio, tipo, contenido);
    assert.ok(recibido.ok, `la recepción debió aceptarse (${recibido.ok ? "" : recibido.motivo})`);
    if (!recibido.ok) throw new Error("recepción rechazada");
    const procesado = await procesar(recibido.carga.id, recibido.contexto);
    return { carga: recibido.carga, contexto: recibido.contexto, procesado };
  }

  async function estadoDe(cargaId: string) {
    return prisma.cargaBioestadistica.findUniqueOrThrow({
      where: { id: cargaId },
      select: { estado: true, motivoFallo: true, rutaArchivo: true, cantidadFilasDatos: true, reemplazadaPorCargaId: true },
    });
  }

  async function contarFilas(cargaId: string): Promise<number> {
    return prisma.cargaBioestadisticaFila.count({ where: { cargaBioestadisticaId: cargaId } });
  }

  async function archivosEnDisco(): Promise<string[]> {
    const resultado: string[] = [];
    for (const entrada of await readdir(directorio, { withFileTypes: true, recursive: true })) {
      if (entrada.isFile()) resultado.push(path.relative(directorio, path.join(entrada.parentPath, entrada.name)));
    }
    return resultado;
  }

  async function aprobar(cargaId: string, motivo = "corrección de datos") {
    const solicitud = await solicitarReemplazoBioestadistica(
      { cargaBioestadisticaId: cargaId, usuarioId: bioId, motivo },
      { repositorio: repositorioSolicitudes, repositorioCargas, repositorioVentanas },
    );
    assert.ok(solicitud.ok, `la solicitud debió crearse (${solicitud.ok ? "" : solicitud.motivo})`);
    if (!solicitud.ok) throw new Error("solicitud rechazada");
    const revision = await revisarSolicitudReemplazoBioestadistica(
      solicitud.solicitud.id,
      { revisadoPorId: revisorId, decision: "APROBAR", comentario: null },
      { repositorio: repositorioSolicitudes, repositorioVentanas },
    );
    assert.ok(revision.ok);
    if (!revision.ok) throw new Error("revisión rechazada");
    return revision.solicitud;
  }

  try {
    await escenario("recepción → procesamiento → ACTIVA, filas vacías omitidas, archivo definitivo", async () => {
      await crearVentana(2030);
      const { carga, procesado } = await subirYProcesar(bioId, 2030, "DEFUNCIONES");
      assert.equal(carga.estado, "PROCESANDO");
      assert.deepEqual(carga.encabezados, ["Rut", "Fecha", "Diagnóstico"]);
      assert.equal(carga.establecimientoId, establecimiento.id);
      assert.deepEqual(procesado, { estado: "ACTIVA", cantidadFilasDatos: 3 });

      const estado = await estadoDe(carga.id);
      assert.equal(estado.estado, "ACTIVA");
      assert.equal(estado.rutaArchivo, `2030/${carga.id}.csv`);
      const filas = await prisma.cargaBioestadisticaFila.findMany({
        where: { cargaBioestadisticaId: carga.id },
        orderBy: { numeroFila: "asc" },
        select: { numeroFila: true, valores: true },
      });
      assert.deepEqual(filas.map((fila) => fila.numeroFila), [2, 3, 5]);
      assert.deepEqual(filas[2]?.valores, { Rut: "3-5", Fecha: "2025-03-01", Diagnóstico: null });
      assert.ok((await archivosEnDisco()).includes(path.join("2030", `${carga.id}.csv`)));
      assert.deepEqual(await readdir(path.join(directorio, "tmp")), []);
    });

    await escenario("segundo intento sin autorización → YA_REPORTADO; Egresos no se bloquea por Defunciones", async () => {
      const segundo = await recibir(bioId, 2030, "DEFUNCIONES", CSV_OK);
      assert.deepEqual(segundo, { ok: false, motivo: "YA_REPORTADO" });
      const egresos = await subirYProcesar(bioId, 2030, "EGRESOS");
      assert.equal(egresos.procesado.estado, "ACTIVA");
    });

    await escenario("rechazos de recepción: año no disponible, estructura, firma, sin establecimiento", async () => {
      assert.deepEqual(await recibir(bioId, 2031, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "SIN_ANIO_DISPONIBLE" });
      await crearVentana(2032, { publicada: false });
      assert.deepEqual(await recibir(bioId, 2032, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "SIN_ANIO_DISPONIBLE" });

      await crearVentana(2033);
      assert.deepEqual(await recibir(bioId, 2033, "DEFUNCIONES", "a;a\n1;2\n"), {
        ok: false,
        motivo: "ESTRUCTURA_INVALIDA",
        detalle: "ENCABEZADO_DUPLICADO",
      });
      assert.deepEqual(await recibir(bioId, 2033, "DEFUNCIONES", "texto", "datos.xlsx"), { ok: false, motivo: "ARCHIVO_NO_COINCIDE" });
      assert.deepEqual(await recibir(bioId, 2033, "DEFUNCIONES", ""), { ok: false, motivo: "ARCHIVO_VACIO" });
      assert.deepEqual(await recibir(sinEstablecimientoId, 2033, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "SIN_ESTABLECIMIENTO" });
      // Ningún rechazo deja archivos huérfanos.
      assert.deepEqual(await readdir(path.join(directorio, "tmp")), []);
      assert.equal(await prisma.cargaBioestadistica.count({ where: { anio: 2033 } }), 0);
    });

    await escenario("EN_PROCESO: un segundo archivo mientras el primero se procesa, también en paralelo", async () => {
      await crearVentana(2034);
      const [primero, segundo] = await Promise.all([
        recibir(bioId, 2034, "DEFUNCIONES", CSV_OK),
        recibir(bioId, 2034, "DEFUNCIONES", CSV_OK),
      ]);
      const aceptados = [primero, segundo].filter((resultado) => resultado.ok);
      assert.equal(aceptados.length, 1, "solo uno puede quedar PROCESANDO");
      assert.ok([primero, segundo].some((resultado) => !resultado.ok && resultado.motivo === "EN_PROCESO"));
      assert.deepEqual(await recibir(bioId, 2034, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "EN_PROCESO" });

      const aceptado = aceptados[0]!;
      if (!aceptado.ok) throw new Error("inalcanzable");
      assert.equal((await procesar(aceptado.carga.id, aceptado.contexto)).estado, "ACTIVA");
      // El archivo del rechazado no quedó en disco.
      assert.deepEqual(await readdir(path.join(directorio, "tmp")), []);
      assert.equal((await readdir(path.join(directorio, "2034"))).length, 1);
    });

    await escenario("reemplazo con el año cerrado: copia diasVigencia máximo, consume la solicitud y desactiva la anterior", async () => {
      // Año con dos ventanas que admiten autorizaciones (7 y 15 días) y una archivada (30): manda 15.
      await crearVentana(2035, { abierta: true, dias: 7, formatoId: formatoA });
      const { carga: original } = await subirYProcesar(bioId, 2035, "DEFUNCIONES");

      await prisma.ventanaCarga.updateMany({
        where: { anio: 2035 },
        data: { fechaVencimiento: new Date("2001-01-01T23:59:59.999Z") },
      });
      await crearVentana(2035, { abierta: false, dias: 15, formatoId: formatoB });
      await crearVentana(2035, { abierta: false, dias: 30, formatoId: formatoC, archivada: true });

      // Año cerrado sin autorización: no se puede subir.
      assert.deepEqual(await recibir(bioId, 2035, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "YA_REPORTADO" });

      const solicitud = await aprobar(original.id);
      assert.equal(solicitud.diasVigencia, 15);

      const panel = await obtenerPanelBioestadistica(bioId, new Date(), {
        repositorioCargas,
        repositorioSolicitudes,
        repositorioVentanas,
      });
      const tarjeta = panel.find((item) => item.anio === 2035 && item.tipoArchivo === "DEFUNCIONES");
      assert.equal(tarjeta?.estado, "REEMPLAZO_AUTORIZADO");
      assert.equal(tarjeta?.cierraEl, null);

      const { carga: nueva, contexto, procesado } = await subirYProcesar(bioId, 2035, "DEFUNCIONES");
      assert.deepEqual(contexto.reemplazo, { cargaAnteriorId: original.id, solicitudId: solicitud.id });
      assert.equal(procesado.estado, "ACTIVA");

      const anterior = await estadoDe(original.id);
      assert.equal(anterior.estado, "REEMPLAZADA");
      assert.equal(anterior.reemplazadaPorCargaId, nueva.id);
      // Retención: la reemplazada conserva sus filas y su archivo.
      assert.equal(await contarFilas(original.id), 3);
      assert.ok(anterior.rutaArchivo);
      assert.ok(await almacen.abrirLectura(anterior.rutaArchivo!));

      const consumida = await prisma.solicitudReemplazoBioestadistica.findUniqueOrThrow({ where: { id: solicitud.id } });
      assert.ok(consumida.utilizadaEn);
      assert.equal(consumida.nuevaCargaBioestadisticaId, nueva.id);
      const motivo = await prisma.cargaBioestadistica.findUniqueOrThrow({ where: { id: original.id }, select: { motivoDesactivacion: true } });
      assert.equal(motivo.motivoDesactivacion, "corrección de datos");

      // Consumo condicional: la misma solicitud ya no autoriza otra activación.
      const otra = await repositorioCargas.crearProcesando({
        id: crypto.randomUUID(),
        anio: 2035,
        tipoArchivo: "DEFUNCIONES",
        usuarioId: bioId,
        establecimientoId: establecimiento.id,
        nombreArchivoOriginal: "otra.csv",
        tipoContenidoArchivo: "text/csv",
        referenciaArchivo: anterior.rutaArchivo!,
        tamanoBytes: 10,
        sha256: "0".repeat(64),
        encabezados: ["Rut"],
      });
      const activacion = await repositorioCargas.activar({
        cargaId: otra.id,
        cantidadFilasDatos: 1,
        procesadaEn: new Date(),
        reemplazo: { cargaAnteriorId: nueva.id, solicitudId: solicitud.id },
      });
      assert.deepEqual(activacion, { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" });
      assert.equal((await estadoDe(nueva.id)).estado, "ACTIVA");
      // Se limpia sin tocar el archivo de la reemplazada (la referencia era prestada).
      await prisma.cargaBioestadistica.update({ where: { id: otra.id }, data: { estado: "FALLIDA", motivoFallo: "PRUEBA", rutaArchivo: null } });
    });

    await escenario("fallo a mitad de camino: filas borradas, archivo eliminado y la anterior sigue ACTIVA", async () => {
      await crearVentana(2036);
      const { carga: original } = await subirYProcesar(bioId, 2036, "EGRESOS");
      const solicitud = await aprobar(original.id);

      const lineas = ["Rut;Valor", ...Array.from({ length: 5003 }, (_, indice) => `${indice}-K;${indice}`)];
      const recibido = await recibir(bioId, 2036, "EGRESOS", `${lineas.join("\n")}\n`);
      assert.ok(recibido.ok);
      if (!recibido.ok) return;

      // La solicitud se consume "por otro lado" mientras se procesa: la activación debe fallar.
      await prisma.solicitudReemplazoBioestadistica.update({ where: { id: solicitud.id }, data: { utilizadaEn: new Date() } });

      const procesado = await procesar(recibido.carga.id, recibido.contexto);
      assert.deepEqual(procesado, { estado: "FALLIDA", motivo: "REEMPLAZO_NO_AUTORIZADO" });

      const fallida = await estadoDe(recibido.carga.id);
      assert.equal(fallida.estado, "FALLIDA");
      assert.equal(fallida.rutaArchivo, null);
      assert.equal(await contarFilas(recibido.carga.id), 0);
      assert.ok(!(await archivosEnDisco()).includes(path.join("2036", `${recibido.carga.id}.csv`)));
      assert.equal((await estadoDe(original.id)).estado, "ACTIVA");
    });

    await escenario("sin filas de datos → FALLIDA SIN_FILAS_DATOS y la combinación queda libre", async () => {
      await crearVentana(2037);
      const recibido = await recibir(bioId, 2037, "DEFUNCIONES", "Rut;Fecha\n\n");
      assert.ok(recibido.ok);
      if (!recibido.ok) return;
      assert.deepEqual(await procesar(recibido.carga.id, recibido.contexto), { estado: "FALLIDA", motivo: "SIN_FILAS_DATOS" });
      assert.equal((await subirYProcesar(bioId, 2037, "DEFUNCIONES")).procesado.estado, "ACTIVA");
    });

    await escenario("huérfanos al arrancar: solo los PROCESANDO anteriores al arranque", async () => {
      await crearVentana(2038);
      const huerfana = await recibir(bioId, 2038, "DEFUNCIONES", CSV_OK);
      assert.ok(huerfana.ok);
      if (!huerfana.ok) return;
      await new Promise((resolver) => setTimeout(resolver, 20));
      const arranque = new Date();
      await new Promise((resolver) => setTimeout(resolver, 20));
      const nueva = await recibir(bioId, 2038, "EGRESOS", CSV_OK);
      assert.ok(nueva.ok);
      if (!nueva.ok) return;

      const liberadas = await marcarProcesamientosHuerfanosComoFallidos(arranque, { repositorio: repositorioCargas, almacen });
      assert.equal(liberadas, 1);
      const estado = await estadoDe(huerfana.carga.id);
      assert.equal(estado.estado, "FALLIDA");
      assert.equal(estado.motivoFallo, "PROCESAMIENTO_INTERRUMPIDO");
      assert.ok(!(await archivosEnDisco()).includes(path.join("2038", `${huerfana.carga.id}.csv`)));
      assert.equal((await estadoDe(nueva.carga.id)).estado, "PROCESANDO");
      // El procesamiento tardío de la huérfana ya no hace nada.
      assert.deepEqual(await procesar(huerfana.carga.id, huerfana.contexto), { estado: "OMITIDA" });
      assert.equal((await procesar(nueva.carga.id, nueva.contexto)).estado, "ACTIVA");

      // Lotes tardíos que un procesamiento insertó DESPUÉS de que la marcaran FALLIDA: se borran
      // (por lotes, condicionados a FALLIDA). Las filas de una ACTIVA nunca se tocan.
      await repositorioCargas.insertarFilas(huerfana.carga.id, [
        { numeroFila: 2, valores: { Rut: "1-9" } },
        { numeroFila: 3, valores: { Rut: "2-7" } },
      ]);
      const filasActiva = await contarFilas(nueva.carga.id);
      assert.ok(filasActiva > 0);
      assert.equal(await repositorioCargas.eliminarFilasDeCargaFallida(huerfana.carga.id), 2);
      assert.equal(await contarFilas(huerfana.carga.id), 0);
      assert.equal(await repositorioCargas.eliminarFilasDeCargaFallida(nueva.carga.id), 0);
      assert.equal(await contarFilas(nueva.carga.id), filasActiva);
    });

    await escenario("descarga: propia y administrativa sí, ajena e inexistente no", async () => {
      const activa = await repositorioCargas.obtenerActiva(bioId, 2030, "DEFUNCIONES");
      assert.ok(activa);
      const propia = await obtenerArchivoCargaBioestadistica({ cargaId: activa!.id, usuarioId: bioId }, { repositorio: repositorioCargas, almacen });
      assert.ok(propia);
      assert.equal(await new Response(propia!.flujo).text(), CSV_OK);
      assert.equal(propia!.nombreArchivoOriginal, "datos.csv");

      assert.equal(await obtenerArchivoCargaBioestadistica({ cargaId: activa!.id, usuarioId: otroBioId }, { repositorio: repositorioCargas, almacen }), null);
      const administrativa = await obtenerArchivoCargaBioestadistica({ cargaId: activa!.id, usuarioId: null }, { repositorio: repositorioCargas, almacen });
      assert.ok(administrativa);
      await administrativa!.flujo.cancel();
      assert.equal(
        await obtenerArchivoCargaBioestadistica({ cargaId: crypto.randomUUID(), usuarioId: null }, { repositorio: repositorioCargas, almacen }),
        null,
      );
    });

    await escenario("solicitar con el año sin ventanas que admitan autorizaciones → VENTANA_NO_DISPONIBLE", async () => {
      const activa = await repositorioCargas.obtenerActiva(bioId, 2030, "EGRESOS");
      await prisma.ventanaCarga.updateMany({ where: { anio: 2030 }, data: { archivada: true, publicada: false } });
      const resultado = await solicitarReemplazoBioestadistica(
        { cargaBioestadisticaId: activa!.id, usuarioId: bioId, motivo: "x" },
        { repositorio: repositorioSolicitudes, repositorioCargas, repositorioVentanas },
      );
      assert.deepEqual(resultado, { ok: false, motivo: "VENTANA_NO_DISPONIBLE" });
      // Ajena: no encontrada.
      const ajena = await solicitarReemplazoBioestadistica(
        { cargaBioestadisticaId: activa!.id, usuarioId: otroBioId, motivo: "x" },
        { repositorio: repositorioSolicitudes, repositorioCargas, repositorioVentanas },
      );
      assert.deepEqual(ajena, { ok: false, motivo: "NO_ENCONTRADO" });
    });

    await escenario("una solicitud aprobada deja de ser utilizable si el año se archiva (ajuste RF-36)", async () => {
      await crearVentana(2039);
      const { carga } = await subirYProcesar(bioId, 2039, "DEFUNCIONES");
      await aprobar(carga.id);
      await prisma.ventanaCarga.updateMany({ where: { anio: 2039 }, data: { archivada: true, publicada: false } });
      assert.deepEqual(await recibir(bioId, 2039, "DEFUNCIONES", CSV_OK), { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" });
    });

    await escenario("ventanas archivadas o eliminadas no afectan a las cargas; eliminar sigue siendo físico", async () => {
      const ventanaId = await crearVentana(2040, { formatoId: formatoB });
      await subirYProcesar(bioId, 2040, "DEFUNCIONES");
      const eliminada = await repositorioVentanas.eliminar(ventanaId, revisorId);
      assert.deepEqual(eliminada, { tipo: "HARD" });
      const listado = await listarCargasBioestadisticaAdministracion(
        { anio: 2040, pagina: 1, tamano: 25 },
        { repositorio: repositorioCargas },
      );
      assert.equal(listado.filas.length, 1);
      assert.equal(listado.filas[0]?.establecimientoNombre, "Hospital de prueba");
      assert.ok(listado.aniosConCargas.includes(2040));
    });

    await escenario("historial de usuario: una carga de Bioestadística impide la eliminación física", async () => {
      const filas = await prisma.$queryRaw<{ tiene: boolean }[]>(
        Prisma.sql`SELECT ${EXPRESION_TIENE_HISTORIAL} AS tiene FROM "usuario" u WHERE u."id" = ${bioId}`,
      );
      assert.equal(filas[0]?.tiene, true);
      const sinHistorial = await prisma.$queryRaw<{ tiene: boolean }[]>(
        Prisma.sql`SELECT ${EXPRESION_TIENE_HISTORIAL} AS tiene FROM "usuario" u WHERE u."id" = ${sinEstablecimientoId}`,
      );
      assert.equal(sinHistorial[0]?.tiene, false);
    });
  } finally {
    await prisma.$disconnect();
    await rm(directorio, { recursive: true, force: true });
  }

  console.log(`\n${ejecutados} escenarios OK`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
