// Pruebas unitarias (sin BD) de las reglas puras que deciden si un notificador puede reemplazar la
// carga APROBADA vigente o subir fuera de plazo: `solicitudUtilizable` (solicitud de reemplazo),
// `reaperturaAutorizaReemplazo` (reapertura tras rechazo), la fórmula única de RF-36
// (`fechaVencimientoAutorizacion`) y `resolverVentanaHabilitada` con repositorios en memoria.
// Bordes de fecha incluidos.
//
//   npx tsx tests/autorizacion-reemplazo.unit.ts
import assert from "node:assert/strict";
import {
  fechaVencimientoSolicitud,
  solicitudUtilizable,
  solicitudVencida,
  type SolicitudReemplazoCarga,
} from "../src/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  fechaLimiteReapertura,
  reaperturaAutorizaReemplazo,
  rechazoPosteriorAAprobacion,
  type CargaArchivoRechazo,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import {
  DIAS_VIGENCIA_REEMPLAZO_POR_DEFECTO,
  diasVigenciaReemplazoValidos,
  fechaVencimientoAutorizacion,
  ventanaAdmiteAutorizaciones,
  type VentanaCarga,
} from "../src/modules/ventanas-carga/domain/entities/VentanaCarga";
import {
  crearVentanaCargaSchema,
  editarVentanaCargaSchema,
} from "../src/modules/ventanas-carga/schemas/ventana-carga.schema";
import { resolverVentanaHabilitada } from "../src/modules/reporte-excel/application/resolverVentanaHabilitada";
import type { CargaArchivoRepository } from "../src/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { CargaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import type { SolicitudReemplazoCargaRepository } from "../src/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import { finDelDiaChile, paredChileAInstante } from "../src/shared/utils/fecha";

// Ventana ya vencida antes de cualquier decisión de estas pruebas: el plazo lo dan los N días.
const VENCIMIENTO_PASADO = new Date("2026-01-31T23:59:59.999Z");
// Ventana que sigue abierta hasta fin de año (hora de pared de Chile escrita en UTC).
const VENCIMIENTO_FIN_DE_ANIO = new Date("2026-12-31T23:59:59.999Z");

function solicitud(cambios: Partial<SolicitudReemplazoCarga>): SolicitudReemplazoCarga {
  return {
    id: "s-1",
    cargaArchivoId: "c-1",
    formatoExcelNombre: "Formato",
    anio: 2026,
    ventanaCargaId: "v-1",
    ventanaFechaVencimiento: VENCIMIENTO_PASADO,
    diasVigenciaReemplazoVentana: 7,
    nombreArchivoOriginal: "a.xlsx",
    solicitadoPorId: "u-1",
    solicitadoPorNombre: "Prueba",
    solicitadoPorRut: "1-9",
    motivo: "m",
    estado: "APROBADA",
    origen: "CARGA_APROBADA",
    revisadoPorId: "r-1",
    revisadoPorNombre: "Revisor",
    revisadoEn: new Date("2026-03-10T15:00:00Z"),
    comentarioRevision: null,
    diasVigencia: 5,
    nuevaCargaArchivoId: null,
    utilizadaEn: null,
    createdAt: new Date("2026-03-09T15:00:00Z"),
    updatedAt: new Date("2026-03-10T15:00:00Z"),
    ...cambios,
  };
}

function probarFormulaUnificada(): void {
  const decision = new Date("2026-03-10T15:00:00Z");

  // Ventana ya vencida al decidir: N días desde la decisión, hasta las 23:59:59.999 de Chile.
  assert.deepEqual(
    fechaVencimientoAutorizacion({ fechaDecision: decision, diasVigencia: 7, fechaVencimientoVentana: VENCIMIENTO_PASADO }),
    finDelDiaChile(decision, 7),
    "vencida: decisión + N",
  );

  // Ventana todavía vigente y lejana: al menos hasta su vencimiento (instante real).
  assert.deepEqual(
    fechaVencimientoAutorizacion({ fechaDecision: decision, diasVigencia: 7, fechaVencimientoVentana: VENCIMIENTO_FIN_DE_ANIO }),
    paredChileAInstante(VENCIMIENTO_FIN_DE_ANIO),
    "vigente: hasta el vencimiento de la ventana",
  );

  // Ventana vigente pero por cerrar (mañana): gana decisión + N.
  const vencimientoManiana = new Date("2026-03-11T23:59:59.999Z");
  assert.deepEqual(
    fechaVencimientoAutorizacion({ fechaDecision: decision, diasVigencia: 7, fechaVencimientoVentana: vencimientoManiana }),
    finDelDiaChile(decision, 7),
    "por cerrar: decisión + N",
  );
  console.log("OK: fechaVencimientoAutorizacion (max(vencimiento ventana, decisión + N))");
}

function probarSolicitudUtilizable(): void {
  const base = solicitud({});
  const limite = finDelDiaChile(base.revisadoEn!, 5);

  assert.equal(solicitudUtilizable(base, base.revisadoEn!), true, "recién aprobada");
  assert.equal(solicitudUtilizable(base, limite), true, "justo en el límite (23:59:59.999 Chile del 5º día)");
  assert.equal(solicitudUtilizable(base, new Date(limite.getTime() + 1)), false, "1 ms después del límite");
  assert.equal(solicitudVencida(base, new Date(limite.getTime() + 1)), true, "vencida tras el límite");
  assert.deepEqual(fechaVencimientoSolicitud(base), limite, "fechaVencimientoSolicitud = límite");

  // RF-36: el plazo usa la COPIA de días de la solicitud (7), no un valor fijo.
  const conSiete = solicitud({ diasVigencia: 7 });
  const limiteSiete = finDelDiaChile(conSiete.revisadoEn!, 7);
  assert.equal(solicitudUtilizable(conSiete, new Date(limite.getTime() + 1)), true, "7 días: sigue utilizable tras el 5º");
  assert.equal(solicitudUtilizable(conSiete, limiteSiete), true, "7 días: en el límite");
  assert.equal(solicitudUtilizable(conSiete, new Date(limiteSiete.getTime() + 1)), false, "7 días: vencida");

  // Ventana todavía vigente al aprobar: habilita hasta su vencimiento aunque pasen los N días.
  const conVentanaVigente = solicitud({ ventanaFechaVencimiento: VENCIMIENTO_FIN_DE_ANIO });
  assert.equal(
    solicitudUtilizable(conVentanaVigente, new Date("2026-11-01T12:00:00Z")),
    true,
    "ventana vigente: utilizable hasta su vencimiento",
  );

  // Consumida (al finalizar): ni utilizable ni vencida, aunque esté dentro de plazo.
  const consumida = solicitud({ utilizadaEn: new Date("2026-03-11T10:00:00Z"), nuevaCargaArchivoId: "c-2" });
  assert.equal(solicitudUtilizable(consumida, base.revisadoEn!), false);
  assert.equal(solicitudVencida(consumida, new Date(limite.getTime() + 1)), false);

  assert.equal(solicitudUtilizable(solicitud({ estado: "PENDIENTE", diasVigencia: null }), base.revisadoEn!), false, "pendiente");
  assert.equal(solicitudUtilizable(solicitud({ estado: "RECHAZADA", diasVigencia: null }), base.revisadoEn!), false, "rechazada");
  assert.equal(solicitudUtilizable(solicitud({ revisadoEn: null }), new Date()), false, "sin ancla de vigencia");
  assert.equal(solicitudUtilizable(solicitud({ diasVigencia: null }), base.revisadoEn!), false, "APROBADA sin días: no utilizable");
  assert.equal(fechaVencimientoSolicitud(solicitud({ estado: "RECHAZADA", diasVigencia: null })), null, "rechazada sin plazo");
  console.log("OK: solicitudUtilizable / solicitudVencida / fechaVencimientoSolicitud");
}

function rechazo(cambios: Partial<Pick<CargaArchivoRechazo, "rechazadoEn" | "diasReapertura" | "reaperturaConsumidaEn">>) {
  return { rechazadoEn: new Date("2026-05-02T12:00:00Z"), diasReapertura: 5, reaperturaConsumidaEn: null, ...cambios };
}

function probarReapertura(): void {
  const vistoBuenoEn = new Date("2026-05-01T12:00:00Z");
  const ventana = { fechaVencimiento: VENCIMIENTO_FIN_DE_ANIO };
  const ahora = new Date("2026-06-01T12:00:00Z");

  const posterior = rechazo({});
  assert.equal(reaperturaAutorizaReemplazo(posterior, ventana, { vistoBuenoEn }, ahora), true, "rechazo posterior");

  const igual = rechazo({ rechazadoEn: new Date(vistoBuenoEn.getTime()) });
  assert.equal(reaperturaAutorizaReemplazo(igual, ventana, { vistoBuenoEn }, ahora), false, "mismo instante");

  const anterior = rechazo({ rechazadoEn: new Date("2026-04-30T12:00:00Z") });
  assert.equal(
    reaperturaAutorizaReemplazo(anterior, ventana, { vistoBuenoEn }, ahora),
    false,
    "una reapertura vieja (anterior a la aprobación vigente) no autoriza",
  );

  const consumida = rechazo({ reaperturaConsumidaEn: new Date("2026-05-03T12:00:00Z") });
  assert.equal(reaperturaAutorizaReemplazo(consumida, ventana, { vistoBuenoEn }, ahora), false, "ya consumida");

  // Ventana vencida antes del rechazo: diasReapertura (copia) días desde el rechazo, hasta las 23:59.
  const ventanaVencida = { fechaVencimiento: new Date("2026-04-01T23:59:59.999Z") };
  const limite = finDelDiaChile(posterior.rechazadoEn, 5);
  assert.equal(reaperturaAutorizaReemplazo(posterior, ventanaVencida, { vistoBuenoEn }, limite), true, "en el límite");
  assert.equal(
    reaperturaAutorizaReemplazo(posterior, ventanaVencida, { vistoBuenoEn }, new Date(limite.getTime() + 1)),
    false,
    "1 ms después del límite",
  );

  // RF-36 (plazo unificado): la reapertura usa sus propios días copiados.
  const conSiete = rechazo({ diasReapertura: 7 });
  assert.deepEqual(fechaLimiteReapertura(conSiete, ventanaVencida), finDelDiaChile(conSiete.rechazadoEn, 7), "7 días");
  // Y con la ventana vigente al rechazar, al menos hasta su vencimiento.
  assert.deepEqual(fechaLimiteReapertura(conSiete, ventana), paredChileAInstante(VENCIMIENTO_FIN_DE_ANIO), "ventana vigente");

  assert.equal(rechazoPosteriorAAprobacion(posterior.rechazadoEn, null), false, "sin vistoBuenoEn no autoriza");
  console.log("OK: reaperturaAutorizaReemplazo / fechaLimiteReapertura / rechazoPosteriorAAprobacion");
}

function probarConfiguracionVentana(): void {
  assert.equal(diasVigenciaReemplazoValidos(1), true);
  assert.equal(diasVigenciaReemplazoValidos(90), true);
  assert.equal(diasVigenciaReemplazoValidos(0), false);
  assert.equal(diasVigenciaReemplazoValidos(91), false);
  assert.equal(diasVigenciaReemplazoValidos(2.5), false);

  const base = {
    anio: 2025,
    fechaApertura: "2025-01-01",
    fechaVencimiento: "2025-12-31",
    formatoExcelId: "6f1d1a4e-3c2b-4a1d-9f3e-2b1c0d9e8f7a",
  };
  const creada = crearVentanaCargaSchema.parse(base);
  assert.equal(creada.diasVigenciaReemplazo, DIAS_VIGENCIA_REEMPLAZO_POR_DEFECTO, "crear: por defecto 7");
  assert.equal(crearVentanaCargaSchema.parse({ ...base, diasVigenciaReemplazo: "30" }).diasVigenciaReemplazo, 30);
  assert.equal(crearVentanaCargaSchema.safeParse({ ...base, diasVigenciaReemplazo: 0 }).success, false, "crear: 0");
  assert.equal(crearVentanaCargaSchema.safeParse({ ...base, diasVigenciaReemplazo: 91 }).success, false, "crear: 91");
  assert.equal(crearVentanaCargaSchema.safeParse({ ...base, diasVigenciaReemplazo: "" }).success, false, "crear: vacío");

  const edicion = {
    fechaApertura: base.fechaApertura,
    fechaVencimiento: base.fechaVencimiento,
    formatoExcelId: base.formatoExcelId,
  };
  assert.equal(editarVentanaCargaSchema.safeParse(edicion).success, false, "editar: obligatorio");
  assert.equal(editarVentanaCargaSchema.parse({ ...edicion, diasVigenciaReemplazo: 90 }).diasVigenciaReemplazo, 90);
  console.log("OK: diasVigenciaReemplazo (dominio y Zod)");
}

// --- resolverVentanaHabilitada con repositorios en memoria ---

function ventana(cambios: Partial<VentanaCarga>): VentanaCarga {
  return {
    id: "v-1",
    anio: 2026,
    fechaApertura: new Date("2026-01-01T00:00:00Z"),
    fechaVencimiento: VENCIMIENTO_PASADO,
    formatoExcelId: "f-1",
    formatoExcelNombre: "Formato",
    publicada: true,
    archivada: false,
    creadoPorId: "r-1",
    creadoPorNombre: "Revisor",
    eliminadaEn: null,
    eliminadaPorId: null,
    eliminadaPorNombre: null,
    createdAt: new Date("2025-12-01T00:00:00Z"),
    updatedAt: new Date("2025-12-01T00:00:00Z"),
    cantidadCargas: 0,
    diasAnticipacionInicio: null,
    intervaloRepeticionDias: null,
    plantillaAlerta: "<p></p>",
    diasVigenciaReemplazo: 7,
    ...cambios,
  };
}

type Escenario = { vigente: boolean; solicitudUtilizable: boolean; reapertura: CargaArchivoRechazo | null };

function dependencias(escenario: Escenario) {
  const repositorio = {
    obtenerReaperturaPendientePorUsuarioYVentana: async () => escenario.reapertura,
    obtenerAprobadaVigentePorUsuarioYVentana: async () => (escenario.vigente ? ({ id: "c-1" } as CargaArchivo) : null),
  } as unknown as CargaArchivoRepository;
  const repositorioSolicitudesReemplazo = {
    obtenerAprobadaUtilizablePorCarga: async () => (escenario.solicitudUtilizable ? solicitud({}) : null),
  } as unknown as SolicitudReemplazoCargaRepository;
  return { repositorio, repositorioSolicitudesReemplazo };
}

async function probarResolverVentanaHabilitada(): Promise<void> {
  const ahora = new Date("2026-03-12T12:00:00Z");
  const sinNada: Escenario = { vigente: true, solicitudUtilizable: false, reapertura: null };
  const conSolicitud: Escenario = { vigente: true, solicitudUtilizable: true, reapertura: null };
  const abierta = { fechaVencimiento: VENCIMIENTO_FIN_DE_ANIO };

  const resolver = (cambios: Partial<VentanaCarga> | null, escenario: Escenario) =>
    resolverVentanaHabilitada({ ventana: cambios ? ventana(cambios) : null, usuarioId: "u-1", ahora }, dependencias(escenario));

  assert.equal(await resolver(null, conSolicitud), "SIN_VENTANA_ABIERTA", "inexistente");
  assert.equal(await resolver({ eliminadaEn: new Date() }, conSolicitud), "SIN_VENTANA_ABIERTA", "eliminada");
  assert.equal(await resolver(abierta, sinNada), null, "abierta y publicada");
  assert.equal(await resolver({ ...abierta, publicada: false }, sinNada), "VENTANA_NO_PUBLICADA", "abierta en borrador");

  // RF-36: cerrada por fecha, publicada y no archivada → habilitada SOLO con autorización vigente.
  assert.equal(await resolver({}, sinNada), "SIN_VENTANA_ABIERTA", "cerrada sin autorización");
  assert.equal(await resolver({}, conSolicitud), null, "cerrada + solicitud utilizable");
  assert.equal(
    await resolver({}, { vigente: false, solicitudUtilizable: false, reapertura: { ...rechazoEntidad(), rechazadoEn: ahora } }),
    null,
    "cerrada + reapertura vigente",
  );

  // Ajuste aprobado: archivada o despublicada bloquea aunque haya autorización.
  assert.equal(await resolver({ archivada: true, publicada: false }, conSolicitud), "SIN_VENTANA_ABIERTA", "archivada");
  assert.equal(await resolver({ publicada: false }, conSolicitud), "SIN_VENTANA_ABIERTA", "despublicada");

  assert.equal(ventanaAdmiteAutorizaciones(ventana({})), true);
  assert.equal(ventanaAdmiteAutorizaciones(ventana({ archivada: true })), false);
  console.log("OK: resolverVentanaHabilitada (RF-36, ajuste archivada/despublicada)");
}

function rechazoEntidad(): CargaArchivoRechazo {
  return {
    id: "r-1",
    cargaArchivoId: "c-0",
    ventanaCargaId: "v-1",
    anio: 2026,
    ventanaFechaVencimiento: VENCIMIENTO_PASADO,
    formatoExcelNombre: "Formato",
    nombreArchivoOriginal: "a.xlsx",
    motivo: "m",
    rechazadoEn: new Date("2026-03-10T12:00:00Z"),
    rechazadoPorId: "r-1",
    rechazadoPorNombre: "Revisor",
    diasReapertura: 7,
    reaperturaConsumidaEn: null,
    reaperturaConsumidaPorCargaArchivoId: null,
    createdAt: new Date("2026-03-10T12:00:00Z"),
  };
}

async function main(): Promise<void> {
  probarFormulaUnificada();
  probarSolicitudUtilizable();
  probarReapertura();
  probarConfiguracionVentana();
  await probarResolverVentanaHabilitada();
  console.log("Todas las pruebas de autorización de reemplazo pasaron");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
