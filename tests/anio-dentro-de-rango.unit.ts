// Regla `ANIO_DENTRO_DE_RANGO_VENTANA`: el año de cada fecha con valor (una o más columnas) debe
// caer en [año de la ventana − aniosAntes, año de la ventana + aniosDespues], bordes incluidos.
//
//   npx tsx tests/anio-dentro-de-rango.unit.ts
//
// Fija TZ=America/Santiago antes de crear cualquier fecha (mismo motivo que
// `comparacion-anio-ventana.unit.ts`): el año se toma en UTC, no en el huso del proceso.
process.env.TZ = "America/Santiago";

import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  esConfiguracionAnioDentroDeRango,
  esConfiguracionComparacionAnioVentana,
  esConfiguracionComparacionFechas,
  type ColumnaFormatoExcel,
  type ConfiguracionAnioDentroDeRango,
  type FormatoExcel,
  type ReglaValidacionFormatoExcel,
} from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  crearFormatoExcelSchema,
} from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import { aConfiguracionRegla } from "../src/modules/formatos-excel/infrastructure/repositories/mapearConfiguracionRegla";
import type { ValorCeldaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  cumpleReglaValidacion,
  mensajeReglaValidacion,
} from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import { crearMotorValidacionFilas } from "../src/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import { mensajeSugeridoAnioRango } from "../src/shared/utils/reglasValidacion";
import {
  aplicarCamposDerivados,
  conDesplazamientoAnios,
  configuracionInicial,
  errorAniosRango,
  errorDesplazamientoAnios,
  interpretarTextoNumerico,
  type ReglaValidacionEditable,
} from "../src/shared/utils/edicionReglasValidacion";

const ANIO_VENTANA = 2026;
const ventana = { anio: ANIO_VENTANA, fechaApertura: new Date(Date.UTC(2027, 0, 1)), fechaVencimiento: new Date(Date.UTC(2027, 1, 1)) };
const contexto = { ventana, diaCalendarioHoy: Date.UTC(2027, 0, 15) };

function reglaRango(
  configuracion: ConfiguracionAnioDentroDeRango,
  columnas: string[] = ["DIAGNOSTICO"],
  mensaje = "Año fuera de rango",
): ReglaValidacionFormatoExcel {
  return { id: "r-rango", orden: 1, tipo: "ANIO_DENTRO_DE_RANGO_VENTANA", columnas, mensaje, configuracion };
}

const COLUMNAS: ColumnaFormatoExcel[] = [
  { id: "c1", orden: 1, nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA", tipoEnumeradoNombre: null },
  { id: "c2", orden: 2, nombre: "INGRESO", requerida: false, tipoDato: "FECHA", tipoEnumeradoNombre: null },
  { id: "c3", orden: 3, nombre: "OTRA", requerida: false, tipoDato: "TEXTO", tipoEnumeradoNombre: null },
];

function formatoCon(reglas: ReglaValidacionFormatoExcel[]): FormatoExcel {
  return {
    id: "f",
    nombre: "F",
    descripcion: null,
    nombreArchivoPlantilla: "p.xlsx",
    tipoContenidoPlantilla: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    columnas: COLUMNAS,
    reglasValidacion: reglas,
    tiposEnumerados: [],
  };
}

function validarFilas(reglas: ReglaValidacionFormatoExcel[], filas: ValorCeldaArchivo[][]) {
  const motor = crearMotorValidacionFilas({ formato: formatoCon(reglas), ventana });
  motor.procesarEncabezados(COLUMNAS.map((columna) => ({ texto: columna.nombre, enriquecido: false })));
  filas.forEach((valores, indice) => motor.procesarFila(indice + 2, valores));
  return motor.finalizar(filas.length + 1).errores;
}

test("la prueba corre con TZ=America/Santiago", () => {
  assert.equal(new Date(Date.UTC(2026, 0, 1)).getFullYear(), 2025);
});

test("acepta los bordes desde/hasta y rechaza uno por debajo y uno por encima", () => {
  // Rango [2023, 2027].
  const regla = reglaRango({ aniosAntes: 3, aniosDespues: 1 });
  const cumple = (valor: ValorCeldaArchivo) => cumpleReglaValidacion(regla, { DIAGNOSTICO: valor }, contexto);
  assert.equal(cumple("01-01-2023"), true, "borde desde");
  assert.equal(cumple("31-12-2027"), true, "borde hasta");
  assert.equal(cumple("15-06-2026"), true, "año de la ventana");
  assert.equal(cumple("31-12-2022"), false, "uno por debajo");
  assert.equal(cumple("01-01-2028"), false, "uno por encima");
  // Un Date del 01-01 00:00 UTC toma el año UTC.
  assert.equal(cumple(new Date(Date.UTC(2023, 0, 1))), true);
  assert.equal(cumple(new Date(Date.UTC(2028, 0, 1))), false);
});

test("con N = M = 0 solo se acepta el año de la ventana", () => {
  const regla = reglaRango({ aniosAntes: 0, aniosDespues: 0 });
  const cumple = (valor: ValorCeldaArchivo) => cumpleReglaValidacion(regla, { DIAGNOSTICO: valor }, contexto);
  assert.equal(cumple("01-01-2026"), true);
  assert.equal(cumple("31-12-2026"), true);
  assert.equal(cumple("31-12-2025"), false);
  assert.equal(cumple("01-01-2027"), false);
});

test("celdas vacías o no fecha no cuentan; una fila completamente vacía pasa", () => {
  const regla = reglaRango({ aniosAntes: 0, aniosDespues: 0 }, ["DIAGNOSTICO", "INGRESO"]);
  for (const valor of [null, "", "   ", "no es fecha"]) {
    assert.equal(cumpleReglaValidacion(regla, { DIAGNOSTICO: valor, INGRESO: valor }, contexto), true, String(valor));
  }
  assert.equal(cumpleReglaValidacion(regla, {}, contexto), true);
  assert.equal(cumpleReglaValidacion(regla, { DIAGNOSTICO: null, INGRESO: "15-06-2026" }, contexto), true);
  assert.equal(cumpleReglaValidacion(regla, { DIAGNOSTICO: "", INGRESO: "15-06-2020" }, contexto), false);
});

test("varias columnas con una o varias fuera de rango producen un solo error por fila", () => {
  const regla = reglaRango({ aniosAntes: 1, aniosDespues: 0 }, ["DIAGNOSTICO", "INGRESO"]);
  const errores = validarFilas([regla], [
    ["15-06-2026", "15-06-2010", "a"],
    ["15-06-2010", "15-06-2030", "b"],
    ["15-06-2025", "15-06-2026", "c"],
  ]);
  assert.deepEqual(
    errores.map((error) => [error.numeroFila, error.tipoError, error.columna]),
    // El error informa todas las columnas de la regla.
    [[2, "REGLA_VALIDACION", "DIAGNOSTICO, INGRESO"], [3, "REGLA_VALIDACION", "DIAGNOSTICO, INGRESO"]],
  );
});

test("un texto no parseable solo genera TIPO_DATO_INVALIDO", () => {
  const errores = validarFilas([reglaRango({ aniosAntes: 0, aniosDespues: 0 })], [["no es fecha", null, "x"]]);
  assert.deepEqual(errores.map((error) => error.tipoError), ["TIPO_DATO_INVALIDO"]);
});

test("una fila vacía entre filas con datos no dispara la regla", () => {
  const errores = validarFilas([reglaRango({ aniosAntes: 0, aniosDespues: 0 })], [["15-06-2026", null, "a"], [null, null, null], ["15-06-2026", null, "b"]]);
  assert.deepEqual(errores, []);
});

test("sin configuración válida la regla falla en vez de aceptar en silencio", () => {
  const sinConfiguracion: ReglaValidacionFormatoExcel = { ...reglaRango({ aniosAntes: 0, aniosDespues: 0 }), configuracion: null };
  assert.equal(cumpleReglaValidacion(sinConfiguracion, { DIAGNOSTICO: "15-06-2026" }, contexto), false);
  const conFormaRf40: ReglaValidacionFormatoExcel = { ...sinConfiguracion, configuracion: { operador: "IGUAL" } };
  assert.equal(cumpleReglaValidacion(conFormaRf40, { DIAGNOSTICO: "15-06-2026" }, contexto), false);
});

test("el mensaje reemplaza los tres marcadores y nunca incluye el valor de la celda", () => {
  const regla = reglaRango({ aniosAntes: 2, aniosDespues: 3 }, ["DIAGNOSTICO"], "Entre {anioDesde} y {anioHasta} (ventana {anioVentana}, {anioDesde})");
  assert.equal(mensajeReglaValidacion(regla, { ventana }), "Entre 2024 y 2029 (ventana 2026, 2024)");
  const errores = validarFilas([regla], [["15-06-2019", null, "a"]]);
  assert.equal(errores.length, 1);
  assert.equal(errores[0].mensaje, "Entre 2024 y 2029 (ventana 2026, 2024)");
  assert.ok(!errores[0].mensaje.includes("2019"));
});

test("RF-40 sigue reemplazando solo {anioVentana}; otros tipos dejan los marcadores literales", () => {
  const rf40: ReglaValidacionFormatoExcel = {
    id: "a", orden: 1, tipo: "COMPARACION_ANIO_VENTANA", columnas: ["DIAGNOSTICO"], mensaje: "{anioVentana} {anioDesde} {anioHasta}", configuracion: { operador: "IGUAL" },
  };
  assert.equal(mensajeReglaValidacion(rf40, { ventana }), "2026 {anioDesde} {anioHasta}");
  const otra: ReglaValidacionFormatoExcel = { id: "o", orden: 1, tipo: "FECHA_NO_FUTURA", columnas: ["DIAGNOSTICO"], mensaje: "{anioVentana} {anioDesde}" };
  assert.equal(mensajeReglaValidacion(otra, { ventana }), "{anioVentana} {anioDesde}");
});

test("las guardas no se confunden entre las tres formas de configuración", () => {
  assert.equal(esConfiguracionAnioDentroDeRango({ aniosAntes: 0, aniosDespues: 0 }), true);
  assert.equal(esConfiguracionAnioDentroDeRango({ aniosAntes: 100, aniosDespues: 5 }), true);
  assert.equal(esConfiguracionAnioDentroDeRango({ aniosAntes: -1, aniosDespues: 0 }), false);
  assert.equal(esConfiguracionAnioDentroDeRango({ aniosAntes: 1.5, aniosDespues: 0 }), false);
  assert.equal(esConfiguracionAnioDentroDeRango({ aniosAntes: 0 } as unknown as ConfiguracionAnioDentroDeRango), false);
  assert.equal(esConfiguracionAnioDentroDeRango({ operador: "IGUAL" }), false);
  assert.equal(esConfiguracionAnioDentroDeRango(null), false);
  assert.equal(esConfiguracionComparacionAnioVentana({ aniosAntes: 0, aniosDespues: 0 }), false);
  assert.equal(esConfiguracionComparacionFechas({ aniosAntes: 0, aniosDespues: 0 }), false);
});

// --- Esquema Zod ---

const COLUMNAS_PAYLOAD = [
  { nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA" },
  { nombre: "INGRESO", requerida: false, tipoDato: "FECHA" },
  { nombre: "OTRA", requerida: false, tipoDato: "TEXTO" },
];
const VALIDA = {
  tipo: "ANIO_DENTRO_DE_RANGO_VENTANA",
  columnas: ["diagnostico", "INGRESO"],
  mensaje: "  Entre {anioDesde} y {anioHasta}  ",
  configuracion: { aniosAntes: 0, aniosDespues: 0 },
};
function conRegla(regla: Record<string, unknown>) {
  return crearFormatoExcelSchema.safeParse({ nombre: "F", columnas: COLUMNAS_PAYLOAD, reglasValidacion: [regla] });
}
function problemas(regla: Record<string, unknown>) {
  return (conRegla(regla).error?.issues ?? []).map((problema) => ({ path: problema.path, message: problema.message }));
}

test("el esquema acepta la regla válida y persiste siempre los dos campos, también en 0", () => {
  const resultado = conRegla(VALIDA);
  assert.equal(resultado.success, true);
  assert.deepEqual(resultado.data?.reglasValidacion[0].configuracion, { aniosAntes: 0, aniosDespues: 0 });
  assert.equal(resultado.data?.reglasValidacion[0].mensaje, "Entre {anioDesde} y {anioHasta}");
  assert.deepEqual(conRegla({ ...VALIDA, configuracion: { aniosAntes: 100, aniosDespues: 7 } }).data?.reglasValidacion[0].configuracion, { aniosAntes: 100, aniosDespues: 7 });
  assert.equal(conRegla({ ...VALIDA, columnas: ["DIAGNOSTICO"] }).success, true, "una sola columna");
});

test("el esquema rechaza columnas inválidas con su ruta", () => {
  assert.deepEqual(problemas({ ...VALIDA, columnas: ["DIAGNOSTICO", "OTRA"] }), [
    { path: ["reglasValidacion", 0, "columnas", 1], message: 'La regla 1 solo admite columnas de tipo Fecha: "OTRA"' },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, columnas: ["NO_EXISTE"] }), [
    { path: ["reglasValidacion", 0, "columnas", 0], message: 'La regla 1 hace referencia a una columna que no existe en este formato: "NO_EXISTE"' },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, columnas: ["DIAGNOSTICO", "diagnostico"] }), [
    { path: ["reglasValidacion", 0, "columnas"], message: "No repitas la misma columna dentro de una regla" },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, columnas: [] }), [
    { path: ["reglasValidacion", 0, "columnas"], message: "Selecciona al menos una columna" },
  ]);
});

test("el esquema rechaza configuraciones inválidas con mensaje y ruta", () => {
  const ruta = (campo: string) => ["reglasValidacion", 0, "configuracion", campo];
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { aniosAntes: -1, aniosDespues: 0 } }), [
    { path: ruta("aniosAntes"), message: "Los años antes no pueden ser menores que 0" },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { aniosAntes: 0, aniosDespues: 1.5 } }), [
    { path: ruta("aniosDespues"), message: "Los años después deben ser un número entero" },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { aniosAntes: 101, aniosDespues: 0 } }), [
    { path: ruta("aniosAntes"), message: "Los años antes no pueden ser mayores que 100" },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { aniosAntes: 0, aniosDespues: 101 } }), [
    { path: ruta("aniosDespues"), message: "Los años después no pueden ser mayores que 100" },
  ]);
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { aniosAntes: 0 } }), [
    { path: ruta("aniosDespues"), message: "Los años después deben ser un número entero" },
  ]);
  const claveExtra = problemas({ ...VALIDA, configuracion: { aniosAntes: 0, aniosDespues: 0, extra: 1 } });
  assert.equal(claveExtra.length, 1);
  assert.deepEqual(claveExtra[0].path, ["reglasValidacion", 0, "configuracion"]);
  const mensajeForma = { path: ["reglasValidacion", 0, "configuracion"], message: "Indica cuántos años antes y después del año de la ventana se aceptan" };
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { operador: "IGUAL" } }), [mensajeForma], "forma de RF-40");
  assert.deepEqual(problemas({ ...VALIDA, configuracion: { operador: "IGUAL", aniosAntes: 0, aniosDespues: 0 } }), [mensajeForma], "mezcla con RF-40");
  assert.deepEqual(problemas({ ...VALIDA, configuracion: null }), [mensajeForma], "sin configuración");
  assert.deepEqual(problemas({ ...VALIDA, configuracion: {} }), [mensajeForma], "objeto vacío");
  // Y la forma nueva no pasa por RF-40.
  assert.equal(
    conRegla({ tipo: "COMPARACION_ANIO_VENTANA", columnas: ["DIAGNOSTICO"], mensaje: "m", configuracion: { aniosAntes: 0, aniosDespues: 0 } }).success,
    false,
  );
  assert.equal(conRegla({ ...VALIDA, mensaje: "x".repeat(301) }).success, false, "mensaje largo");
  assert.equal(conRegla({ ...VALIDA, mensaje: "   " }).success, false, "mensaje vacío");
});

// --- Mapper del repositorio (lectura) ---
// `aConfiguracionRegla` vive en un módulo puro (sin Prisma) y se prueba directamente.

test("la lectura del JSON persistido enruta cada tipo a su esquema y lanza con un dato corrupto", () => {
  const persistido: Prisma.JsonValue = { aniosAntes: 2, aniosDespues: 0 };
  assert.deepEqual(aConfiguracionRegla("ANIO_DENTRO_DE_RANGO_VENTANA", persistido), { aniosAntes: 2, aniosDespues: 0 });
  for (const corrupto of [{ operador: "IGUAL" }, { aniosAntes: 2 }, { aniosAntes: -1, aniosDespues: 0 }, { aniosAntes: 0, aniosDespues: 0, x: 1 }, "texto"]) {
    assert.throws(() => aConfiguracionRegla("ANIO_DENTRO_DE_RANGO_VENTANA", corrupto), JSON.stringify(corrupto));
  }

  assert.deepEqual(
    aConfiguracionRegla("COMPARACION_ANIO_VENTANA", { operador: "MENOR_IGUAL", desplazamientoAnios: -2 }),
    { operador: "MENOR_IGUAL", desplazamientoAnios: -2 },
  );
  // El ajuste 0 persistido se sigue leyendo como `{ operador }`.
  assert.deepEqual(aConfiguracionRegla("COMPARACION_ANIO_VENTANA", { operador: "IGUAL", desplazamientoAnios: 0 }), { operador: "IGUAL" });
  assert.throws(() => aConfiguracionRegla("COMPARACION_ANIO_VENTANA", { aniosAntes: 1, aniosDespues: 1 }));

  const comparacionFechas = { origen: { modo: "COLUMNA", columna: "A" }, operador: "MAYOR_IGUAL", referencia: { modo: "COLUMNA", columna: "B" } };
  assert.deepEqual(aConfiguracionRegla("FECHA_POSTERIOR_O_IGUAL", comparacionFechas), comparacionFechas);
  assert.throws(() => aConfiguracionRegla("FECHA_POSTERIOR_O_IGUAL", { operador: "IGUAL" }));
});

test("la lectura devuelve null sin configuración guardada y lanza si un tipo sin configuración trae JSON", () => {
  const tipos = ["ALGUNA_COLUMNA_CON_VALOR", "FILA_DUPLICADA", "RUT_VALIDO", "CONTENIDO_HTML", "FILA_VACIA", "FECHA_NO_FUTURA", "ANIO_DENTRO_DE_RANGO_VENTANA"] as const;
  for (const tipo of tipos) assert.equal(aConfiguracionRegla(tipo, null), null, tipo);
  assert.throws(() => aConfiguracionRegla("FECHA_NO_FUTURA", { operador: "IGUAL" }), /La regla de tipo FECHA_NO_FUTURA no admite configuración/);
  assert.throws(() => aConfiguracionRegla("FILA_DUPLICADA", {}), /La regla de tipo FILA_DUPLICADA no admite configuración/);
});

test("orden igual a RF-40: sin fechas evaluables se cumple aunque la configuración sea inválida; con fecha, inválida → falla", () => {
  const invalida = { ...reglaRango({ aniosAntes: 0, aniosDespues: 0 }), configuracion: null };
  assert.equal(cumpleReglaValidacion(invalida, { DIAGNOSTICO: null }, contexto), true);
  assert.equal(cumpleReglaValidacion(invalida, { DIAGNOSTICO: "no es fecha" }, contexto), true);
  assert.equal(cumpleReglaValidacion(invalida, { DIAGNOSTICO: new Date(Date.UTC(2026, 5, 1)) }, contexto), false);
});

test("conDesplazamientoAnios acepta el número ya interpretado por el campo", () => {
  assert.deepEqual(conDesplazamientoAnios("IGUAL", -3), { operador: "IGUAL", desplazamientoAnios: -3 });
  assert.deepEqual(conDesplazamientoAnios("IGUAL", 0), { operador: "IGUAL" });
  // Un "-" suelto no conserva el valor anterior en silencio: se publica NaN y aparece el error.
  const conSigno = conDesplazamientoAnios("IGUAL", "-");
  assert.ok(Number.isNaN(conSigno.desplazamientoAnios));
  assert.equal(errorDesplazamientoAnios(conSigno.desplazamientoAnios), "El ajuste en años debe ser un número entero");
});

// --- Edición (UI pura) ---

test("utilidades del editor: configuración inicial, lectura del campo y errores con los textos de Zod", () => {
  assert.deepEqual(configuracionInicial("ANIO_DENTRO_DE_RANGO_VENTANA"), { aniosAntes: 0, aniosDespues: 0 });
  // Texto del campo numérico (RF-40/RF-42): vacío = 0; lo no numérico (incluido un signo suelto) = NaN.
  assert.equal(interpretarTextoNumerico(""), 0);
  assert.equal(interpretarTextoNumerico("  "), 0);
  assert.equal(interpretarTextoNumerico("-2"), -2);
  assert.equal(interpretarTextoNumerico("+3"), 3);
  assert.equal(interpretarTextoNumerico(" 7 "), 7);
  assert.equal(interpretarTextoNumerico("1.5"), 1.5);
  for (const texto of ["-", "+", "abc", "1e2", "1."]) assert.ok(Number.isNaN(interpretarTextoNumerico(texto)), texto);
  assert.equal(errorAniosRango(interpretarTextoNumerico("-"), "Los años antes"), "Los años antes deben ser un número entero");
  assert.equal(errorAniosRango(0, "Los años antes"), null);
  assert.equal(errorAniosRango(100, "Los años antes"), null);
  assert.equal(errorAniosRango(-1, "Los años antes"), "Los años antes no pueden ser menores que 0");
  assert.equal(errorAniosRango(101, "Los años después"), "Los años después no pueden ser mayores que 100");
  assert.equal(errorAniosRango(1.5, "Los años después"), "Los años después deben ser un número entero");
  assert.equal(errorAniosRango(Number.NaN, "Los años antes"), "Los años antes deben ser un número entero");
});

test("la sugerencia nombra las columnas y cae a la genérica si supera 300 caracteres", () => {
  assert.equal(mensajeSugeridoAnioRango(["X", "Y"]), 'El año de "X", "Y" debe estar entre {anioDesde} y {anioHasta}');
  assert.equal(mensajeSugeridoAnioRango([]), "El año de las fechas debe estar entre {anioDesde} y {anioHasta}");
  assert.equal(mensajeSugeridoAnioRango(["a".repeat(300)]), "El año de las fechas debe estar entre {anioDesde} y {anioHasta}");
});

test("aplicarCamposDerivados: la sugerencia sigue a las columnas, se vacía al cambiar de tipo y no pisa un mensaje propio", () => {
  const vacia: ReglaValidacionEditable = { tipo: "ALGUNA_COLUMNA_CON_VALOR", columnas: [], mensaje: "" };
  const cambioATipo = (regla: ReglaValidacionEditable, tipo: ReglaValidacionEditable["tipo"]) =>
    aplicarCamposDerivados(regla, { tipo, columnas: [], modoRut: undefined, configuracion: configuracionInicial(tipo) });

  const rango = cambioATipo(vacia, "ANIO_DENTRO_DE_RANGO_VENTANA");
  assert.equal(rango.mensaje, "El año de las fechas debe estar entre {anioDesde} y {anioHasta}");
  const conColumnas = aplicarCamposDerivados(rango, { columnas: ["A", "B"] });
  assert.equal(conColumnas.mensaje, 'El año de "A", "B" debe estar entre {anioDesde} y {anioHasta}');
  // Cambiar los años no altera la sugerencia (usa marcadores), ni la pisa.
  assert.equal(aplicarCamposDerivados(conColumnas, { configuracion: { aniosAntes: 3, aniosDespues: 1 } }).mensaje, conColumnas.mensaje);

  // A un tipo sin sugerencia: se vacía.
  assert.equal(cambioATipo(conColumnas, "FECHA_NO_FUTURA").mensaje, "");
  // A RF-40: se reemplaza por su sugerencia; y de vuelta, por la del rango.
  const aRf40 = cambioATipo(conColumnas, "COMPARACION_ANIO_VENTANA");
  assert.equal(aRf40.mensaje, "El año de la fecha debe ser mayor o igual al año de la ventana ({anioVentana})");
  assert.equal(cambioATipo(aRf40, "ANIO_DENTRO_DE_RANGO_VENTANA").mensaje, "El año de las fechas debe estar entre {anioDesde} y {anioHasta}");

  // Un mensaje escrito a mano nunca se pisa ni se vacía.
  const manual = aplicarCamposDerivados(conColumnas, { mensaje: "Propio" });
  assert.equal(aplicarCamposDerivados(manual, { columnas: ["A"] }).mensaje, "Propio");
  assert.equal(cambioATipo(manual, "FECHA_NO_FUTURA").mensaje, "Propio");
  assert.equal(cambioATipo({ ...vacia, mensaje: "Otro" }, "ANIO_DENTRO_DE_RANGO_VENTANA").mensaje, "Otro");
});

test("RF-40 conserva su comportamiento en aplicarCamposDerivados", () => {
  const base: ReglaValidacionEditable = { tipo: "COMPARACION_ANIO_VENTANA", columnas: [], mensaje: "", configuracion: { operador: "MAYOR_IGUAL" } };
  const conColumna = aplicarCamposDerivados(base, { columnas: ["D"] });
  assert.equal(conColumna.mensaje, 'El año de "D" debe ser mayor o igual al año de la ventana ({anioVentana})');
});
