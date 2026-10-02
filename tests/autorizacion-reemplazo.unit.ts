// Pruebas unitarias (sin BD) de las reglas puras que deciden si un notificador puede reemplazar la
// carga APROBADA vigente: `solicitudUtilizable` (solicitud de reemplazo) y
// `reaperturaAutorizaReemplazo` (reapertura tras rechazo). Bordes de fecha incluidos.
//
//   npx tsx tests/autorizacion-reemplazo.unit.ts
import assert from "node:assert/strict";
import {
  solicitudUtilizable,
  solicitudVencida,
  type SolicitudReemplazoCarga,
} from "../src/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  reaperturaAutorizaReemplazo,
  rechazoPosteriorAAprobacion,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivoRechazo";
import { finDelDiaChile } from "../src/shared/utils/fecha";

function solicitud(cambios: Partial<SolicitudReemplazoCarga>): SolicitudReemplazoCarga {
  return {
    id: "s-1",
    cargaArchivoId: "c-1",
    formatoExcelNombre: "Formato",
    anio: 2026,
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
    nuevaCargaArchivoId: null,
    utilizadaEn: null,
    createdAt: new Date("2026-03-09T15:00:00Z"),
    updatedAt: new Date("2026-03-10T15:00:00Z"),
    ...cambios,
  };
}

function probarSolicitudUtilizable(): void {
  const base = solicitud({});
  const limite = finDelDiaChile(base.revisadoEn!, 5);

  assert.equal(solicitudUtilizable(base, base.revisadoEn!), true, "recién aprobada");
  assert.equal(solicitudUtilizable(base, limite), true, "justo en el límite (23:59:59.999 Chile del 5º día)");
  assert.equal(solicitudUtilizable(base, new Date(limite.getTime() + 1)), false, "1 ms después del límite");
  assert.equal(solicitudVencida(base, new Date(limite.getTime() + 1)), true, "vencida tras el límite");

  // Consumida (al finalizar): ni utilizable ni vencida, aunque esté dentro de plazo.
  const consumida = solicitud({ utilizadaEn: new Date("2026-03-11T10:00:00Z"), nuevaCargaArchivoId: "c-2" });
  assert.equal(solicitudUtilizable(consumida, base.revisadoEn!), false);
  assert.equal(solicitudVencida(consumida, new Date(limite.getTime() + 1)), false);

  assert.equal(solicitudUtilizable(solicitud({ estado: "PENDIENTE" }), base.revisadoEn!), false, "pendiente");
  assert.equal(solicitudUtilizable(solicitud({ estado: "RECHAZADA" }), base.revisadoEn!), false, "rechazada");
  assert.equal(solicitudUtilizable(solicitud({ revisadoEn: null }), new Date()), false, "sin ancla de vigencia");
  console.log("OK: solicitudUtilizable / solicitudVencida");
}

function probarReapertura(): void {
  const vistoBuenoEn = new Date("2026-05-01T12:00:00Z");
  // Ventana abierta hasta fin de año (hora de pared de Chile escrita en UTC).
  const ventana = { fechaVencimiento: new Date("2026-12-31T23:59:59.999Z") };
  const ahora = new Date("2026-06-01T12:00:00Z");

  const posterior = { rechazadoEn: new Date("2026-05-02T12:00:00Z"), reaperturaConsumidaEn: null };
  assert.equal(reaperturaAutorizaReemplazo(posterior, ventana, { vistoBuenoEn }, ahora), true, "rechazo posterior");

  const igual = { rechazadoEn: new Date(vistoBuenoEn.getTime()), reaperturaConsumidaEn: null };
  assert.equal(reaperturaAutorizaReemplazo(igual, ventana, { vistoBuenoEn }, ahora), false, "mismo instante");

  const anterior = { rechazadoEn: new Date("2026-04-30T12:00:00Z"), reaperturaConsumidaEn: null };
  assert.equal(
    reaperturaAutorizaReemplazo(anterior, ventana, { vistoBuenoEn }, ahora),
    false,
    "una reapertura vieja (anterior a la aprobación vigente) no autoriza",
  );

  const consumida = { rechazadoEn: posterior.rechazadoEn, reaperturaConsumidaEn: new Date("2026-05-03T12:00:00Z") };
  assert.equal(reaperturaAutorizaReemplazo(consumida, ventana, { vistoBuenoEn }, ahora), false, "ya consumida");

  // Ventana vencida antes del rechazo: 5 días desde el rechazo, hasta las 23:59 de Chile.
  const ventanaVencida = { fechaVencimiento: new Date("2026-04-01T23:59:59.999Z") };
  const limite = finDelDiaChile(posterior.rechazadoEn, 5);
  assert.equal(reaperturaAutorizaReemplazo(posterior, ventanaVencida, { vistoBuenoEn }, limite), true, "en el límite");
  assert.equal(
    reaperturaAutorizaReemplazo(posterior, ventanaVencida, { vistoBuenoEn }, new Date(limite.getTime() + 1)),
    false,
    "1 ms después del límite",
  );

  assert.equal(rechazoPosteriorAAprobacion(posterior.rechazadoEn, null), false, "sin vistoBuenoEn no autoriza");
  console.log("OK: reaperturaAutorizaReemplazo / rechazoPosteriorAAprobacion");
}

probarSolicitudUtilizable();
probarReapertura();
console.log("Todas las pruebas de autorización de reemplazo pasaron");
