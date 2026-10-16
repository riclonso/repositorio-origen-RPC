// Columnas informadas en los errores `REGLA_VALIDACION`: una regla compuesta (RUT + DV, fila
// duplicada, comparación de fechas, ...) informa TODAS sus columnas, no `null`. Sin base de datos.
//
//   npx tsx tests/columnas-error-regla.unit.ts
import assert from "node:assert/strict";
import type {
  ColumnaFormatoExcel,
  ConfiguracionReglaValidacion,
  FormatoExcel,
  ReglaValidacionFormatoExcel,
  TipoReglaValidacion,
} from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ValorCeldaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import { columnasErrorRegla } from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import { crearMotorValidacionFilas } from "../src/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";

const VENTANA = { anio: 2025, fechaApertura: new Date(Date.UTC(2025, 0, 1)), fechaVencimiento: new Date(Date.UTC(2025, 11, 31)) };

const ENCABEZADOS = ["Número RUT", "DV", "Correo", "Comentario", "Fecha Ingreso", "Fecha Egreso"];

function columna(orden: number, nombre: string, tipoDato: ColumnaFormatoExcel["tipoDato"]): ColumnaFormatoExcel {
  return { id: `col-${orden}`, orden, nombre, requerida: false, tipoDato, tipoEnumeradoNombre: null };
}

function regla(
  orden: number,
  tipo: TipoReglaValidacion,
  columnas: string[],
  mensaje: string,
  configuracion: ConfiguracionReglaValidacion | null = null,
): ReglaValidacionFormatoExcel {
  return { id: `regla-${orden}`, orden, tipo, columnas, mensaje, ...(configuracion ? { configuracion } : {}) };
}

const REGLAS: ReglaValidacionFormatoExcel[] = [
  regla(1, "RUT_VALIDO", ["Número RUT", "DV"], "RUT inválido"),
  regla(2, "ALGUNA_COLUMNA_CON_VALOR", ["Correo", "Comentario"], "Indica correo o comentario"),
  regla(3, "FILA_DUPLICADA", ["Número RUT", "DV"], "RUT repetido"),
  regla(4, "FECHA_POSTERIOR_O_IGUAL", ["Fecha Egreso", "Fecha Ingreso"], "El egreso no puede ser anterior al ingreso", {
    origen: { modo: "COLUMNA", columna: "Fecha Egreso" },
    referencia: { modo: "COLUMNA", columna: "Fecha Ingreso" },
  }),
  regla(5, "FILA_VACIA", [], "No se permiten filas vacías"),
];

const FORMATO: FormatoExcel = {
  id: "formato-columnas-error",
  nombre: "Formato columnas error",
  descripcion: null,
  nombreArchivoPlantilla: "plantilla.xlsx",
  tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  tipoArchivo: "EXCEL",
  separadorCsv: null,
  activo: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  columnas: [
    columna(1, "Número RUT", "TEXTO"),
    columna(2, "DV", "TEXTO"),
    columna(3, "Correo", "TEXTO"),
    columna(4, "Comentario", "TEXTO"),
    columna(5, "Fecha Ingreso", "FECHA"),
    columna(6, "Fecha Egreso", "FECHA"),
  ],
  reglasValidacion: REGLAS,
  tiposEnumerados: [],
};

function validar(filas: ValorCeldaArchivo[][]) {
  const motor = crearMotorValidacionFilas({ formato: FORMATO, ventana: VENTANA });
  motor.procesarEncabezados(ENCABEZADOS.map((texto) => ({ texto, enriquecido: false })));
  filas.forEach((valores, indice) => motor.procesarFila(indice + 2, valores));
  return motor.finalizar(filas.length + 1);
}

// 1. Función pura.
assert.equal(columnasErrorRegla(REGLAS[0]), "Número RUT, DV");
assert.equal(columnasErrorRegla(regla(9, "RUT_VALIDO", ["RUT"], "x")), "RUT");
assert.equal(columnasErrorRegla(regla(9, "FILA_DUPLICADA", ["A", "B", "A"], "x")), "A, B");
assert.equal(columnasErrorRegla(REGLAS[4]), null);

// 2. Motor: cada regla compuesta informa todas sus columnas.
const resultado = validar([
  // Fila 2: RUT con DV incorrecto, sin correo ni comentario, egreso anterior al ingreso.
  ["12345678", "0", null, null, new Date(Date.UTC(2025, 2, 10)), new Date(Date.UTC(2025, 2, 1))],
  // Fila 3: RUT válido, correcto en todo lo demás.
  ["12345678", "5", "a@b.cl", null, new Date(Date.UTC(2025, 2, 1)), new Date(Date.UTC(2025, 2, 10))],
  // Fila 4: mismo RUT que la fila 3 (duplicado).
  ["12345678", "5", "a@b.cl", null, new Date(Date.UTC(2025, 2, 1)), new Date(Date.UTC(2025, 2, 10))],
]);

const porFila = resultado.errores.map((error) => `${error.numeroFila}|${error.columna}|${error.mensaje}`);
assert.deepEqual(porFila, [
  "2|Número RUT, DV|RUT inválido",
  "2|Correo, Comentario|Indica correo o comentario",
  "2|Fecha Egreso, Fecha Ingreso|El egreso no puede ser anterior al ingreso",
  "4|Número RUT, DV|RUT repetido",
]);

// 3. Fila vacía entre filas con datos: `FILA_VACIA` no declara columnas, sigue en `null`.
const conVacia = validar([["12345678", "5", "a@b.cl", null, null, null], [], ["11111111", "1", "a@b.cl", null, null, null]]);
assert.deepEqual(
  conVacia.errores.map((error) => `${error.numeroFila}|${error.columna}|${error.mensaje}`),
  ["3|null|No se permiten filas vacías"],
);

console.log("columnas-error-regla: OK");
