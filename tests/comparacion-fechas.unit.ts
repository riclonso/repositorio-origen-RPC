import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import type { ConfiguracionComparacionFechas, FormatoExcel, ReglaValidacionFormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import { cumpleComparacionFechas } from "../src/modules/reporte-excel/infrastructure/validacion/ComparadorFechas";
import { crearFormatoExcelSchema, editarFormatoExcelSchema } from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import { validarXlsxEnStreaming } from "../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
const configuracion: ConfiguracionComparacionFechas = { origen: { modo: "COLUMNA", columna: "INGRESO" }, referencia: { modo: "COMPONENTES", dia: "D", mes: "M", anio: "A" } };
const columnas = [{ nombre: "INGRESO", requerida: false, tipoDato: "FECHA" as const }, ...["D", "M", "A"].map((nombre) => ({ nombre, requerida: false, tipoDato: "ENTERO" as const }))];
const regla: ReglaValidacionFormatoExcel = { id: "r", orden: 1, tipo: "FECHA_POSTERIOR_O_IGUAL", columnas: ["INGRESO", "D", "M", "A"], mensaje: "Ingreso anterior a nacimiento o fecha inválida", configuracion };
const payload = { nombre: "Fechas", columnas, reglasValidacion: [regla] };

test("compara el día UTC, permite igualdad y funciona con fuentes mixtas", () => {
  for (const fecha of ["29-02-2024", new Date("2024-02-29T23:59:00Z")]) assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: fecha, D: "29", M: 2, A: 2024 }), true);
  assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: "28-02-2024", D: 29, M: 2, A: 2024 }), false);
  const invertida = { origen: configuracion.referencia, referencia: configuracion.origen };
  assert.equal(cumpleComparacionFechas(invertida, { INGRESO: "28-02-2024", D: 29, M: 2, A: 2024 }), true);
});
test("fuentes completas y componentes funcionan también en ambos lados", () => {
  const completas: ConfiguracionComparacionFechas = { origen: { modo: "COLUMNA", columna: "ATENCION" }, referencia: { modo: "COLUMNA", columna: "INGRESO" } };
  assert.equal(cumpleComparacionFechas(completas, { ATENCION: "02-03-2024", INGRESO: "01-03-2024" }), true);
  assert.equal(cumpleComparacionFechas(completas, { ATENCION: "01-03-2024", INGRESO: "02-03-2024" }), false);
  const componentes: ConfiguracionComparacionFechas = { origen: { modo: "COMPONENTES", dia: "D2", mes: "M2", anio: "A2" }, referencia: configuracion.referencia };
  assert.equal(cumpleComparacionFechas(componentes, { D: 31, M: 12, A: 2023, D2: 1, M2: 1, A2: 2024 }), true);
  assert.equal(cumpleComparacionFechas(componentes, { D: 1, M: 1, A: 2024, D2: 31, M2: 12, A2: 2023 }), false);
});
test("rechaza fechas imposibles, componentes parciales, decimales y años inválidos", () => {
  for (const cambios of [{ D: 29, M: 2, A: 2023 }, { D: 31, M: 4 }, { M: null }, { D: 1.2 }, { A: 0 }, { D: true }]) {
    assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: "01-03-2024", D: 1, M: 2, A: 2024, ...cambios }), false);
  }
  assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: "31-02-2024", D: 1, M: 1, A: 2024 }), false);
});
test("omite fechas completamente vacías pero nunca un lado inválido", () => {
  assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: null, D: 1, M: 1, A: 2024 }), true);
  assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: "01-01-2024", D: null, M: " ", A: null }), true);
  assert.equal(cumpleComparacionFechas(configuracion, { INGRESO: null, D: 31, M: 2, A: 2024 }), false);
});
test("alta y edición derivan referencias desde configuración y validan tipos", () => {
  for (const schema of [crearFormatoExcelSchema, editarFormatoExcelSchema]) {
    const resultado = schema.parse({ ...payload, reglasValidacion: [{ ...regla, columnas: ["OTRA"], configuracion: { ...configuracion, origen: { modo: "COLUMNA", columna: "ingreso" } } }] });
    assert.deepEqual(resultado.reglasValidacion[0].columnas, ["INGRESO", "D", "M", "A"]);
    assert.equal(schema.safeParse({ ...payload, columnas: columnas.map((columna) => ({ ...columna, tipoDato: "TEXTO" })) }).success, false);
    assert.equal(schema.safeParse({ ...payload, reglasValidacion: [{ ...regla, configuracion: { ...configuracion, referencia: { modo: "COMPONENTES", dia: "D", mes: "D", anio: "A" } } }] }).success, false);
    assert.equal(schema.safeParse({ ...payload, reglasValidacion: [{ ...regla, configuracion: null }] }).success, false);
  }
});
test("lector streaming aplica reglas independientes por fila y conserva privacidad", async () => {
  const formato: FormatoExcel = { id: "f", nombre: "Fechas", descripcion: null, nombreArchivoPlantilla: "p.xlsx", tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", tipoArchivo: "EXCEL", separadorCsv: null, activo: true, createdAt: new Date(), updatedAt: new Date(), columnas: columnas.map((columna, indice) => ({ ...columna, id: String(indice), orden: indice + 1, tipoEnumeradoNombre: null })), reglasValidacion: [regla], tiposEnumerados: [] };
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Fechas");
  hoja.addRow(columnas.map((columna) => columna.nombre));
  hoja.addRow([new Date("2024-02-29T00:00:00Z"), 29, 2, 2024]);
  hoja.addRow([new Date("2024-02-28T00:00:00Z"), 29, 2, 2024]);
  hoja.addRow([new Date("2024-03-01T00:00:00Z"), 31, 2, 2024]);
  const resultado = await validarXlsxEnStreaming({ buffer: Buffer.from(await libro.xlsx.writeBuffer()) }, formato, { anio: 2024, fechaApertura: new Date(), fechaVencimiento: new Date() });
  assert.deepEqual(resultado.errores.map((error) => error.numeroFila), [3, 4]);
  assert.equal(resultado.errores.every((error) => error.mensaje === regla.mensaje), true);
});
