// Integración del reemplazo de cargas aprobadas (corrección del bloqueo): la autorización
// (solicitud de reemplazo o reapertura) se CONSUME al finalizar, no al subir; una aprobación ya
// superada nunca vuelve a bloquear; al aprobar un reemplazo queda una sola publicación activa.
//
// Ejecutar SOLO contra una base PostgreSQL local y DESECHABLE con las migraciones aplicadas. Nunca
// contra la base de desarrollo compartida ni producción:
//
//   REEMPLAZO_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... \
//     npx tsx tests/reemplazo-carga.integration.ts
//
// Usa los repositorios Prisma reales; solo el formato (columnas) y el lector de archivo son dobles,
// para controlar si cada subida trae o no errores sin construir binarios Excel.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/infrastructure/database/prisma";
import { prismaCargaArchivoRepository as repositorio } from "../src/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { prismaSolicitudReemplazoCargaRepository as repositorioSolicitudes } from "../src/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { prismaVentanaCargaRepository as repositorioVentanas } from "../src/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import { validarYCargarArchivo } from "../src/modules/reporte-excel/application/use-cases/ValidarYCargarArchivo";
import { finalizarYEnviarCarga } from "../src/modules/reporte-excel/application/use-cases/FinalizarYEnviarCarga";
import { darVistoBueno } from "../src/modules/reporte-excel/application/use-cases/DarVistoBueno";
import { rechazarCarga } from "../src/modules/reporte-excel/application/use-cases/RechazarCarga";
import { solicitarReemplazoCarga } from "../src/modules/solicitudes-reemplazo/application/use-cases/SolicitarReemplazoCarga";
import type { LectorArchivoReporte } from "../src/modules/reporte-excel/application/ports";
import type { ValorCeldaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import type { FormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "../src/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

const marca = randomUUID().slice(0, 8);
const usuariosCreados: string[] = [];
const ventanasCreadas: string[] = [];
let formatoId = "";
let anioSiguiente = 6000 + Math.floor(Math.random() * 1000) * 10;
let revisorId = "";
let notificadorId = "";

// --- Dobles: formato con una columna ENTERO requerida y un lector que devuelve filas fijas ---
let filasSiguientes: Record<string, ValorCeldaArchivo>[] = [];
const FILAS_OK = [{ a: 1 }];
const FILAS_CON_ERROR = [{ a: "no es entero" }];

const lector: LectorArchivoReporte = {
  leer: async () => ({ encabezados: ["a"], filas: filasSiguientes }),
};

function formato(): FormatoExcel {
  return {
    id: formatoId,
    nombre: `Reemplazo-${marca}`,
    descripcion: null,
    nombreArchivoPlantilla: "plantilla.xlsx",
    tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    columnas: [{ id: "c1", orden: 1, nombre: "a", requerida: true, tipoDato: "ENTERO" }],
    reglasValidacion: [],
  } as unknown as FormatoExcel;
}

const repositorioFormatosExcel = {
  estaAsignadoYActivo: async () => true,
  obtenerPorId: async () => formato(),
} as unknown as FormatoExcelRepository;

// --- Helpers de flujo ---

async function crearUsuario(perfilCodigo: string): Promise<string> {
  const id = randomUUID();
  await prisma.usuario.create({
    data: {
      id,
      nombres: "Prueba",
      apellidos: `Reemplazo ${marca}`,
      rut: id,
      email: `${id}@example.invalid`,
      username: id,
      perfilCodigo,
    },
  });
  usuariosCreados.push(id);
  return id;
}

type Ventana = { id: string; anio: number };

async function crearVentana(): Promise<Ventana> {
  const anio = anioSiguiente++;
  const ventana = await prisma.ventanaCarga.create({
    data: {
      anio,
      fechaApertura: new Date("2000-01-01T00:00:00Z"),
      fechaVencimiento: new Date("2100-12-31T23:59:00Z"),
      formatoExcelId: formatoId,
      creadoPorId: revisorId,
      plantillaAlerta: "<p>prueba</p>",
      publicada: true,
    },
    select: { id: true },
  });
  ventanasCreadas.push(ventana.id);
  return { id: ventana.id, anio };
}

async function subir(ventana: Ventana, filas: Record<string, ValorCeldaArchivo>[]) {
  filasSiguientes = filas;
  return validarYCargarArchivo(
    {
      formatoExcelId: formatoId,
      anio: ventana.anio,
      usuarioId: notificadorId,
      nombreArchivoOriginal: `archivo-${randomUUID().slice(0, 4)}.xlsx`,
      tipoContenidoArchivo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      tipoArchivoDetectado: "EXCEL",
      contenidoArchivo: Buffer.from("contenido"),
    },
    {
      repositorio,
      repositorioFormatosExcel,
      repositorioVentanasCarga: repositorioVentanas,
      repositorioSolicitudesReemplazo: repositorioSolicitudes,
      lector,
    },
  );
}

async function subirOk(ventana: Ventana): Promise<string> {
  const resultado = await subir(ventana, FILAS_OK);
  assert.ok(resultado.ok, `subida debería estar autorizada (${resultado.ok ? "" : resultado.motivo})`);
  assert.equal(resultado.carga.estado, "PENDIENTE_VISTO_BUENO");
  return resultado.carga.id;
}

function finalizar(id: string) {
  return finalizarYEnviarCarga(id, notificadorId, {
    repositorio,
    repositorioSolicitudesReemplazo: repositorioSolicitudes,
    repositorioVentanasCarga: repositorioVentanas,
  });
}

async function aprobar(id: string): Promise<void> {
  filasSiguientes = FILAS_OK;
  const resultado = await darVistoBueno(id, revisorId, {
    repositorio,
    lector,
    repositorioSolicitudesReemplazo: repositorioSolicitudes,
    repositorioFormatosExcel,
  });
  assert.ok(resultado.ok, "visto bueno");
}

// Sube, finaliza y aprueba: deja una `APROBADA` vigente en la ventana.
async function cargaAprobada(ventana: Ventana): Promise<string> {
  const id = await subirOk(ventana);
  const finalizada = await finalizar(id);
  assert.ok(finalizada.ok, `finalizar (${finalizada.ok ? "" : finalizada.motivo})`);
  await aprobar(id);
  return id;
}

async function solicitarYAprobar(cargaArchivoId: string, motivo: string): Promise<string> {
  const solicitud = await solicitarReemplazoCarga(
    { cargaArchivoId, usuarioId: notificadorId, motivo },
    { repositorio: repositorioSolicitudes, repositorioCargas: repositorio },
  );
  assert.ok(solicitud.ok, `solicitar reemplazo (${solicitud.ok ? "" : solicitud.motivo})`);
  const revisada = await repositorioSolicitudes.revisar(solicitud.solicitud.id, {
    revisadoPorId: revisorId,
    estado: "APROBADA",
    comentarioRevision: null,
  });
  assert.ok(revisada);
  return solicitud.solicitud.id;
}

async function rechazar(id: string, motivo: string): Promise<void> {
  const resultado = await rechazarCarga(id, { rechazadoPorId: revisorId, motivo }, { repositorio });
  assert.ok(resultado.ok, "rechazo");
}

async function publicacionesActivas(ventana: Ventana): Promise<string[]> {
  const filas = await prisma.cargaArchivoPublicada.findMany({
    where: { activo: true, cargaArchivo: { usuarioId: notificadorId, ventanaCargaId: ventana.id } },
    select: { cargaArchivoId: true },
  });
  return filas.map((fila) => fila.cargaArchivoId);
}

// --- Escenarios ---

async function escenarioA(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  const solicitudId = await solicitarYAprobar(original, "Motivo A");

  for (let intento = 0; intento < 2; intento++) {
    const conErrores = await subir(ventana, FILAS_CON_ERROR);
    assert.ok(conErrores.ok);
    assert.equal(conErrores.carga.estado, "CON_ERRORES");
  }

  const tras = await prisma.solicitudReemplazoCarga.findUniqueOrThrow({ where: { id: solicitudId } });
  assert.equal(tras.utilizadaEn, null, "un intento con errores no consume la solicitud");

  const reemplazo = await subirOk(ventana);
  const finalizada = await finalizar(reemplazo);
  assert.ok(finalizada.ok);
  assert.equal(finalizada.solicitudReemplazoId, solicitudId);

  const consumida = await prisma.solicitudReemplazoCarga.findUniqueOrThrow({ where: { id: solicitudId } });
  assert.ok(consumida.utilizadaEn, "se consume al finalizar");
  assert.equal(consumida.nuevaCargaArchivoId, reemplazo);
  console.log("OK A: reintentos con errores no consumen la solicitud; finalizar sí");
}

async function escenarioB(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  const solicitudId = await solicitarYAprobar(original, "Motivo B");

  const borrador = await subirOk(ventana); // el notificador cierra el modal sin finalizar
  const ultima = await subirOk(ventana); // y vuelve a subir: sigue autorizado

  assert.deepEqual(await finalizar(borrador), { ok: false, motivo: "NO_ENCONTRADO" }, "no es el último intento");

  const finalizada = await finalizar(ultima);
  assert.ok(finalizada.ok);
  const consumida = await prisma.solicitudReemplazoCarga.findUniqueOrThrow({ where: { id: solicitudId } });
  assert.equal(consumida.nuevaCargaArchivoId, ultima, "nuevaCargaArchivoId apunta a la carga finalizada");
  console.log("OK B: borrador sin finalizar no bloquea; solo el último intento se finaliza");
}

async function escenarioConcurrencia(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  const solicitudId = await solicitarYAprobar(original, "Motivo concurrencia");
  const reemplazo = await subirOk(ventana);

  const resultados = await Promise.all([finalizar(reemplazo), finalizar(reemplazo)]);
  assert.equal(resultados.filter((resultado) => resultado.ok).length, 1, "un solo éxito");
  // Según en qué paso se cruce con la primera: ya finalizada (NO_ENCONTRADO) o solicitud ya
  // consumida (REEMPLAZO_NO_AUTORIZADO). Ambas son rechazos correctos.
  const fallida = resultados.find((resultado) => !resultado.ok);
  assert.ok(fallida && !fallida.ok && ["NO_ENCONTRADO", "REEMPLAZO_NO_AUTORIZADO"].includes(fallida.motivo));

  const consumida = await prisma.solicitudReemplazoCarga.findUniqueOrThrow({ where: { id: solicitudId } });
  assert.equal(consumida.nuevaCargaArchivoId, reemplazo, "un solo consumo");
  console.log("OK: doble finalizar concurrente -> un éxito y un consumo");
}

async function escenarioC(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  await solicitarYAprobar(original, "Motivo del notificador C");

  const primerReemplazo = await subirOk(ventana);
  assert.ok((await finalizar(primerReemplazo)).ok);
  await rechazar(primerReemplazo, "Rechazo del revisor");

  // La reapertura (posterior a la aprobación de `original`) autoriza volver a subir.
  const segundoReemplazo = await subirOk(ventana);
  const finalizada = await finalizar(segundoReemplazo);
  assert.ok(finalizada.ok);
  assert.equal(finalizada.solicitudReemplazoId, null, "autorizado por reapertura, no por solicitud");

  const rechazo = await prisma.cargaArchivoRechazo.findUniqueOrThrow({ where: { cargaArchivoId: primerReemplazo } });
  assert.ok(rechazo.reaperturaConsumidaEn, "la reapertura se consume al finalizar");
  assert.equal(rechazo.reaperturaConsumidaPorCargaArchivoId, segundoReemplazo);

  await aprobar(segundoReemplazo);
  assert.deepEqual(await publicacionesActivas(ventana), [segundoReemplazo], "una sola publicación activa");

  const publicacionOriginal = await prisma.cargaArchivoPublicada.findUniqueOrThrow({
    where: { cargaArchivoId: original },
  });
  assert.equal(publicacionOriginal.activo, false);
  assert.equal(publicacionOriginal.reemplazadaPorCargaArchivoId, segundoReemplazo);
  assert.equal(publicacionOriginal.motivoDesactivacion, "Motivo del notificador C", "motivo de la última solicitud consumida");
  assert.equal(publicacionOriginal.motivoDesactivacionTipo, "REEMPLAZO");
  console.log("OK C: rechazo del reemplazo -> reapertura -> aprobar deja una sola publicación activa");

  // La original quedó superada: el listado del revisor la marca, rechazarla falla sin crear un
  // rechazo (que abriría una reapertura no pedida) y no habilita una subida nueva.
  const listado = await repositorio.listarPendientesODecididas({ ventanaCargaId: ventana.id, pagina: 1, tamano: 25 });
  assert.equal(listado.filas.find((fila) => fila.id === original)?.publicacionActiva, false, "original superada");
  assert.equal(listado.filas.find((fila) => fila.id === segundoReemplazo)?.publicacionActiva, true, "vigente activa");

  const rechazoSuperada = await rechazarCarga(
    original,
    { rechazadoPorId: revisorId, motivo: "Intento sobre superada" },
    { repositorio },
  );
  assert.deepEqual(rechazoSuperada, { ok: false, motivo: "NO_RECHAZABLE" });
  assert.equal(await prisma.cargaArchivoRechazo.count({ where: { cargaArchivoId: original } }), 0, "sin rechazo");
  const originalTras = await prisma.cargaArchivo.findUniqueOrThrow({ where: { id: original } });
  assert.equal(originalTras.estado, "APROBADA", "sigue APROBADA (superada)");
  assert.deepEqual(await subir(ventana, FILAS_OK), { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" });
  console.log("OK C2: una aprobación superada no es rechazable ni habilita subida");
}

async function escenarioD(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  await solicitarYAprobar(original, "Motivo D");

  const primerReemplazo = await subirOk(ventana);
  assert.ok((await finalizar(primerReemplazo)).ok);

  // Reemplazo de un reemplazo todavía pendiente (origen CARGA_PENDIENTE_DECISION): al aprobarse, la
  // ruta PATCH rechaza la carga pendiente.
  await solicitarYAprobar(primerReemplazo, "Motivo D2");
  await rechazar(primerReemplazo, "Rechazada por reemplazo aprobado");

  const segundoReemplazo = await subirOk(ventana);
  assert.ok((await finalizar(segundoReemplazo)).ok);
  console.log("OK D: reemplazo de un reemplazo pendiente queda autorizado");
}

async function escenarioE(): Promise<void> {
  const ventana = await crearVentana();
  const primera = await cargaAprobada(ventana);
  await solicitarYAprobar(primera, "Motivo E");
  const segunda = await subirOk(ventana);
  assert.ok((await finalizar(segunda)).ok);
  await aprobar(segunda);
  assert.deepEqual(await publicacionesActivas(ventana), [segunda]);

  await rechazar(segunda, "Rechazo unilateral de la aprobada");

  const vigente = await repositorio.obtenerAprobadaVigentePorUsuarioYVentana(notificadorId, ventana.id);
  assert.equal(vigente, null, "la aprobación superada no revive como vigente");

  const nueva = await subir(ventana, FILAS_OK);
  assert.ok(nueva.ok, "la aprobación superada no bloquea la subida");

  const solicitudSobreSuperada = await solicitarReemplazoCarga(
    { cargaArchivoId: primera, usuarioId: notificadorId, motivo: "x" },
    { repositorio: repositorioSolicitudes, repositorioCargas: repositorio },
  );
  assert.deepEqual(solicitudSobreSuperada, { ok: false, motivo: "NO_ES_VIGENTE" });
  console.log("OK E: aprobación superada no bloquea ni admite solicitud de reemplazo");
}

async function escenarioSolicitudVencida(): Promise<void> {
  const ventana = await crearVentana();
  const original = await cargaAprobada(ventana);
  const solicitudId = await solicitarYAprobar(original, "Motivo vencida");
  const reemplazo = await subirOk(ventana);

  await prisma.solicitudReemplazoCarga.update({
    where: { id: solicitudId },
    data: { revisadoEn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
  });

  assert.deepEqual(await finalizar(reemplazo), { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" });
  const solicitud = await prisma.solicitudReemplazoCarga.findUniqueOrThrow({ where: { id: solicitudId } });
  assert.equal(solicitud.utilizadaEn, null);
  const carga = await prisma.cargaArchivo.findUniqueOrThrow({ where: { id: reemplazo } });
  assert.equal(carga.finalizadaEn, null, "la carga no queda finalizada");
  console.log("OK: solicitud vencida entre subida y finalizar -> REEMPLAZO_NO_AUTORIZADO");
}

async function escenarioVentanaCerrada(): Promise<void> {
  const ventana = await crearVentana();
  const carga = await subirOk(ventana);

  await prisma.ventanaCarga.update({
    where: { id: ventana.id },
    data: { fechaVencimiento: new Date("2001-01-01T00:00:00Z") },
  });

  assert.deepEqual(await finalizar(carga), { ok: false, motivo: "SIN_VENTANA_ABIERTA" });
  console.log("OK: ventana cerrada entre subida y finalizar (sin reapertura) -> rechazado");
}

async function escenarioReaperturaVieja(): Promise<void> {
  const ventana = await crearVentana();
  const rechazada = await subirOk(ventana);
  assert.ok((await finalizar(rechazada)).ok);
  await rechazar(rechazada, "Rechazo antiguo");

  const aprobada = await subirOk(ventana);
  assert.ok((await finalizar(aprobada)).ok);

  // Simula un dato heredado: la reapertura antigua quedó sin consumir y la aprobación es posterior.
  await prisma.cargaArchivoRechazo.update({
    where: { cargaArchivoId: rechazada },
    data: { reaperturaConsumidaEn: null, reaperturaConsumidaPorCargaArchivoId: null },
  });
  await aprobar(aprobada);

  assert.deepEqual(await subir(ventana, FILAS_OK), { ok: false, motivo: "REEMPLAZO_NO_AUTORIZADO" });
  console.log("OK: reapertura vieja (rechazadoEn < vistoBuenoEn) no autoriza");
}

// Defensa a nivel de repositorio/BD: dos cargas distintas de la misma combinación finalizándose a la
// vez (el caso de uso lo impide antes con "solo el último intento", esto prueba la red final).
async function escenarioIndiceUnicoPendienteFinalizada(): Promise<void> {
  const ventana = await crearVentana();
  const primera = await subirOk(ventana);
  const segunda = await subirOk(ventana);

  const resultados = await Promise.all([
    repositorio.finalizar(primera, notificadorId, { solicitudReemplazoId: null }),
    repositorio.finalizar(segunda, notificadorId, { solicitudReemplazoId: null }),
  ]);
  assert.equal(resultados.filter((resultado) => resultado.ok).length, 1, "solo una queda finalizada");
  assert.deepEqual(
    resultados.find((resultado) => !resultado.ok),
    { ok: false, motivo: "CARGA_PENDIENTE_DECISION" },
  );

  // El índice parcial, directo: una segunda pendiente finalizada viola la unicidad (P2002).
  const ganadora = resultados[0].ok ? segunda : primera;
  await assert.rejects(
    prisma.cargaArchivo.update({ where: { id: ganadora }, data: { finalizadaEn: new Date() } }),
    (error: unknown) => (error as { code?: string }).code === "P2002",
  );
  console.log("OK: índice único parcial -> una sola pendiente finalizada por combinación (P2002 traducido)");
}

async function limpiar(): Promise<void> {
  const ids = usuariosCreados;
  const cargas = await prisma.cargaArchivo.findMany({ where: { usuarioId: { in: ids } }, select: { id: true } });
  const idsCargas = cargas.map((carga) => carga.id);

  await prisma.solicitudReemplazoCarga.deleteMany({ where: { cargaArchivoId: { in: idsCargas } } });
  await prisma.cargaArchivoRechazo.deleteMany({ where: { cargaArchivoId: { in: idsCargas } } });
  await prisma.cargaArchivoPublicada.deleteMany({ where: { cargaArchivoId: { in: idsCargas } } });
  await prisma.cargaArchivo.deleteMany({ where: { id: { in: idsCargas } } });
  await prisma.ventanaCarga.deleteMany({ where: { id: { in: ventanasCreadas } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  if (formatoId) await prisma.formatoExcel.deleteMany({ where: { id: formatoId } });
}

async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
  assert.equal(process.env.REEMPLAZO_TEST_DATABASE, "true", "Requiere autorización de BD desechable");

  try {
    formatoId = (
      await prisma.formatoExcel.create({
        data: {
          nombre: `Reemplazo-${marca}`,
          nombreArchivoPlantilla: "plantilla.xlsx",
          tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          tipoArchivo: "EXCEL",
          contenidoPlantilla: Uint8Array.from(Buffer.from("x")),
        },
        select: { id: true },
      })
    ).id;

    revisorId = await crearUsuario("REVISOR_REPOSITORIO");
    notificadorId = await crearUsuario("NOTIFICADOR_RPC");

    await escenarioA();
    await escenarioB();
    await escenarioConcurrencia();
    await escenarioC();
    await escenarioD();
    await escenarioE();
    await escenarioSolicitudVencida();
    await escenarioVentanaCerrada();
    await escenarioReaperturaVieja();
    await escenarioIndiceUnicoPendienteFinalizada();

    console.log("Todas las pruebas de reemplazo de cargas pasaron");
  } finally {
    await limpiar();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
