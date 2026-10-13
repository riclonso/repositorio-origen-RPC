import assert from "node:assert/strict";
import test from "node:test";
import type { ReglaValidacionFormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import { crearFormatoExcelSchema } from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import { cumpleReglaValidacion, diaCalendarioSantiago } from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";

const regla: ReglaValidacionFormatoExcel = { id: "r", orden: 1, tipo: "FECHA_NO_FUTURA", columnas: ["ATENCION"], mensaje: "Fecha futura" };
const ventana = { anio: 2026, fechaApertura: new Date(), fechaVencimiento: new Date() };
const contexto = { ventana, diaCalendarioHoy: Date.UTC(2026, 9, 13) };

test("acepta hoy y el pasado, rechaza mañana, omite vacías", () => {
  assert.equal(cumpleReglaValidacion(regla, { ATENCION: "12-10-2026" }, contexto), true);
  assert.equal(cumpleReglaValidacion(regla, { ATENCION: "13-10-2026" }, contexto), true);
  assert.equal(cumpleReglaValidacion(regla, { ATENCION: new Date("2026-10-13T23:59:00Z") }, contexto), true);
  assert.equal(cumpleReglaValidacion(regla, { ATENCION: "14-10-2026" }, contexto), false);
  assert.equal(cumpleReglaValidacion(regla, { ATENCION: null }, contexto), true);
});

test("hoy se calcula en America/Santiago", () => {
  // 02:00 UTC del 14 es todavía el 13 en Chile (UTC-3).
  assert.equal(diaCalendarioSantiago(new Date("2026-10-14T02:00:00Z")), Date.UTC(2026, 9, 13));
});

test("el esquema exige exactamente una columna de tipo Fecha", () => {
  const columnas = [{ nombre: "ATENCION", requerida: false, tipoDato: "FECHA" }, { nombre: "OTRA", requerida: false, tipoDato: "TEXTO" }];
  const base = { nombre: "F", columnas };
  assert.equal(crearFormatoExcelSchema.safeParse({ ...base, reglasValidacion: [{ ...regla }] }).success, true);
  assert.equal(crearFormatoExcelSchema.safeParse({ ...base, reglasValidacion: [{ ...regla, columnas: ["OTRA"] }] }).success, false);
  assert.equal(crearFormatoExcelSchema.safeParse({ ...base, reglasValidacion: [{ ...regla, columnas: ["ATENCION", "OTRA"] }] }).success, false);
});
