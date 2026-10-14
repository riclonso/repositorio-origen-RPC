// Regla `COMPARACION_ANIO_VENTANA` (año de una columna de fecha frente al año de la ventana), con
// el año tomado en UTC, no en el huso del proceso.
//
//   npx tsx tests/comparacion-anio-ventana.unit.ts
//
// Fija TZ=America/Santiago antes de crear cualquier fecha: el 01-01 00:00 UTC es todavía el 31-12
// en Chile, así que un `getFullYear()` (hora local) daría el año anterior.
process.env.TZ = "America/Santiago";

import assert from "node:assert/strict";
import test from "node:test";
import type {
  ColumnaFormatoExcel,
  FormatoExcel,
  OperadorComparacionFechas,
  ReglaValidacionFormatoExcel,
} from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import { crearFormatoExcelSchema } from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import type { ValorCeldaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  cumpleReglaValidacion,
  mensajeReglaValidacion,
} from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import { crearMotorValidacionFilas } from "../src/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import { mensajeSugeridoAnioVentana } from "../src/shared/utils/reglasValidacion";
import { esConfiguracionComparacionAnioVentana } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  aplicarCamposDerivados,
  configuracionInicial,
  conDesplazamientoAnios,
  errorDesplazamientoAnios,
  type ReglaValidacionEditable,
} from "../src/shared/utils/edicionReglasValidacion";

const ANIO_VENTANA = 2026;
const ventana = { anio: ANIO_VENTANA, fechaApertura: new Date(Date.UTC(2027, 0, 1)), fechaVencimiento: new Date(Date.UTC(2027, 1, 1)) };
const contexto = { ventana, diaCalendarioHoy: Date.UTC(2027, 0, 15) };

function reglaAnio(operador: OperadorComparacionFechas, mensaje = "Año fuera de rango"): ReglaValidacionFormatoExcel {
  return { id: `r-${operador}`, orden: 1, tipo: "COMPARACION_ANIO_VENTANA", columnas: ["DIAGNOSTICO"], mensaje, configuracion: { operador } };
}

function cumple(operador: OperadorComparacionFechas, valor: ValorCeldaArchivo, contextoEvaluacion = contexto): boolean {
  return cumpleReglaValidacion(reglaAnio(operador), { DIAGNOSTICO: valor }, contextoEvaluacion);
}

const COLUMNAS: ColumnaFormatoExcel[] = [
  { id: "c1", orden: 1, nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA", tipoEnumeradoNombre: null },
  { id: "c2", orden: 2, nombre: "OTRA", requerida: false, tipoDato: "TEXTO", tipoEnumeradoNombre: null },
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

// Valida filas (desde la 2) con el motor de producción y devuelve los errores persistidos.
function validarFilas(reglas: ReglaValidacionFormatoExcel[], filas: ValorCeldaArchivo[][]) {
  const motor = crearMotorValidacionFilas({ formato: formatoCon(reglas), ventana });
  motor.procesarEncabezados(COLUMNAS.map((columna) => ({ texto: columna.nombre, enriquecido: false })));
  filas.forEach((valores, indice) => motor.procesarFila(indice + 2, valores));
  return motor.finalizar(filas.length + 1).errores;
}

test("la prueba corre con TZ=America/Santiago", () => {
  assert.equal(new Date(Date.UTC(2026, 0, 1)).getFullYear(), 2025);
});

test("aplica los cinco operadores contra el año de la ventana", () => {
  // Años 2025 (menor), 2026 (igual) y 2027 (mayor) frente a la ventana 2026.
  const esperado: Record<OperadorComparacionFechas, [boolean, boolean, boolean]> = {
    MENOR: [true, false, false],
    MENOR_IGUAL: [true, true, false],
    IGUAL: [false, true, false],
    MAYOR_IGUAL: [false, true, true],
    MAYOR: [false, false, true],
  };
  for (const [operador, resultados] of Object.entries(esperado) as [OperadorComparacionFechas, boolean[]][]) {
    ["15-06-2025", "15-06-2026", "15-06-2027"].forEach((fecha, indice) =>
      assert.equal(cumple(operador, fecha), resultados[indice], `${operador} ${fecha}`),
    );
  }
});

test("una celda vacía no aplica la regla", () => {
  for (const operador of ["IGUAL", "MAYOR", "MENOR"] as const) {
    assert.equal(cumple(operador, null), true);
    assert.equal(cumple(operador, ""), true);
    assert.equal(cumple(operador, "   "), true);
  }
  assert.equal(cumpleReglaValidacion(reglaAnio("IGUAL"), {}, contexto), true);
});

test("un Date del 01-01 00:00 UTC toma el año UTC aunque el proceso esté en America/Santiago", () => {
  const primeroDeEnero = new Date(Date.UTC(ANIO_VENTANA, 0, 1, 0, 0, 0));
  assert.equal(cumple("IGUAL", primeroDeEnero), true);
  assert.equal(cumple("MENOR", primeroDeEnero), false);
});

test("un texto 31-12-2024 se toma como 2024", () => {
  const contexto2025 = { ...contexto, ventana: { ...ventana, anio: 2025 } };
  assert.equal(cumple("MENOR", "31-12-2024", contexto2025), true);
  assert.equal(cumple("IGUAL", "31-12-2024", contexto2025), false);
  assert.equal(cumple("IGUAL", "31-12-2024 23:59", { ...contexto, ventana: { ...ventana, anio: 2024 } }), true);
});

test("sin configuración válida la regla falla en vez de aceptar en silencio", () => {
  const sinConfiguracion: ReglaValidacionFormatoExcel = { ...reglaAnio("IGUAL"), configuracion: null };
  assert.equal(cumpleReglaValidacion(sinConfiguracion, { DIAGNOSTICO: "15-06-2026" }, contexto), false);
});

test("un texto no parseable solo genera TIPO_DATO_INVALIDO", () => {
  const errores = validarFilas([reglaAnio("IGUAL")], [["no es fecha", "x"]]);
  assert.deepEqual(
    errores.map((error) => error.tipoError),
    ["TIPO_DATO_INVALIDO"],
  );
});

test("una fila vacía entre filas con datos no dispara la regla", () => {
  const errores = validarFilas([reglaAnio("IGUAL")], [["15-06-2026", "a"], [null, null], ["15-06-2026", "b"]]);
  assert.deepEqual(errores, []);
});

test("el mensaje reemplaza {anioVentana} por el año de la ventana y nunca incluye el valor de la celda", () => {
  const regla = reglaAnio("MAYOR_IGUAL", "El año debe ser ≥ {anioVentana} (ventana {anioVentana})");
  const errores = validarFilas([regla], [["15-06-2019", "a"]]);
  assert.equal(errores.length, 1);
  assert.equal(errores[0].tipoError, "REGLA_VALIDACION");
  assert.equal(errores[0].columna, null);
  assert.equal(errores[0].mensaje, "El año debe ser ≥ 2026 (ventana 2026)");
  assert.ok(!errores[0].mensaje.includes("2019"));
});

test("los demás tipos de regla conservan el marcador literal en su mensaje", () => {
  const otra: ReglaValidacionFormatoExcel = { id: "o", orden: 1, tipo: "FECHA_NO_FUTURA", columnas: ["DIAGNOSTICO"], mensaje: "Texto {anioVentana}" };
  assert.equal(mensajeReglaValidacion(otra, { ventana }), "Texto {anioVentana}");
});

test("la sugerencia de mensaje incluye la columna, el operador y el marcador", () => {
  assert.equal(
    mensajeSugeridoAnioVentana("Fecha Diagnóstico", "MAYOR_IGUAL"),
    'El año de "Fecha Diagnóstico" debe ser mayor o igual al año de la ventana ({anioVentana})',
  );
  assert.equal(mensajeSugeridoAnioVentana("", "MENOR"), "El año de la fecha debe ser menor al año de la ventana ({anioVentana})");
});

test("el esquema valida columnas y configuración de la regla", () => {
  const columnas = [
    { nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA" },
    { nombre: "OTRA", requerida: false, tipoDato: "TEXTO" },
    { nombre: "INGRESO", requerida: false, tipoDato: "FECHA" },
  ];
  const base = { nombre: "F", columnas };
  const valida = { tipo: "COMPARACION_ANIO_VENTANA", columnas: ["diagnostico"], mensaje: "Año {anioVentana}", configuracion: { operador: "MAYOR_IGUAL" } };
  const conRegla = (regla: Record<string, unknown>) => crearFormatoExcelSchema.safeParse({ ...base, reglasValidacion: [regla] });

  const resultado = crearFormatoExcelSchema.parse({ ...base, reglasValidacion: [valida] });
  assert.deepEqual(resultado.reglasValidacion[0].configuracion, { operador: "MAYOR_IGUAL" });
  assert.deepEqual(resultado.reglasValidacion[0].columnas, ["diagnostico"]);
  // Varias reglas del mismo tipo en un formato.
  assert.equal(
    crearFormatoExcelSchema.safeParse({ ...base, reglasValidacion: [valida, { ...valida, columnas: ["INGRESO"], configuracion: { operador: "MENOR" } }] }).success,
    true,
  );

  assert.equal(conRegla({ ...valida, columnas: ["DIAGNOSTICO", "INGRESO"] }).success, false, "más de una columna");
  assert.equal(conRegla({ ...valida, columnas: [] }).success, false, "sin columnas");
  assert.equal(conRegla({ ...valida, columnas: ["OTRA"] }).success, false, "columna no FECHA");
  assert.equal(conRegla({ ...valida, columnas: ["NO_EXISTE"] }).success, false, "columna inexistente");
  assert.equal(conRegla({ ...valida, configuracion: {} }).success, false, "operador faltante");
  assert.equal(conRegla({ ...valida, configuracion: null }).success, false, "configuración nula");
  assert.equal(conRegla({ ...valida, configuracion: { operador: "DISTINTO" } }).success, false, "operador inválido");
  assert.equal(conRegla({ ...valida, configuracion: { operador: "IGUAL", extra: 1 } }).success, false, "propiedad extra");
  assert.equal(
    conRegla({
      ...valida,
      configuracion: { origen: { modo: "COLUMNA", columna: "DIAGNOSTICO" }, operador: "IGUAL", referencia: { modo: "COLUMNA", columna: "INGRESO" } },
    }).success,
    false,
    "configuración con forma de comparación entre dos fechas",
  );
  assert.equal(
    conRegla({ tipo: "FECHA_POSTERIOR_O_IGUAL", columnas: [], mensaje: "m", configuracion: { operador: "IGUAL" } }).success,
    false,
    "comparación entre dos fechas con forma de año de ventana",
  );
  assert.equal(
    conRegla({ tipo: "FECHA_NO_FUTURA", columnas: ["DIAGNOSTICO"], mensaje: "m", configuracion: { operador: "IGUAL" } }).success,
    false,
    "configuración en un tipo que no la admite",
  );
});

test("la guarda de configuración del año de la ventana es positiva", () => {
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL" }), true);
  assert.equal(esConfiguracionComparacionAnioVentana(null), false);
  assert.equal(esConfiguracionComparacionAnioVentana(undefined), false);
  // Un objeto sin `operador` (dato corrupto) no se acepta solo por no tener `origen`.
  assert.equal(esConfiguracionComparacionAnioVentana({} as unknown as { operador: "IGUAL" }), false);
  assert.equal(
    esConfiguracionComparacionAnioVentana({ origen: { modo: "COLUMNA", columna: "A" }, operador: "IGUAL", referencia: { modo: "FIJA", fecha: "2024-01-01" } }),
    false,
  );
});

test("el editor sugiere el mensaje y lo vacía al cambiar a otro tipo si seguía siendo la sugerencia", () => {
  const vacia: ReglaValidacionEditable = { tipo: "ALGUNA_COLUMNA_CON_VALOR", columnas: [], mensaje: "" };
  const cambioATipo = (regla: ReglaValidacionEditable, tipo: ReglaValidacionEditable["tipo"]) =>
    aplicarCamposDerivados(regla, { tipo, columnas: [], modoRut: undefined, configuracion: configuracionInicial(tipo) });

  // Elegir el tipo con el mensaje vacío lo rellena con la sugerencia.
  const anio = cambioATipo(vacia, "COMPARACION_ANIO_VENTANA");
  assert.equal(anio.mensaje, "El año de la fecha debe ser mayor o igual al año de la ventana ({anioVentana})");
  // Elegir columna y operador actualiza la sugerencia.
  const conColumna = aplicarCamposDerivados(anio, { columnas: ["DIAGNOSTICO"] });
  const conOperador = aplicarCamposDerivados(conColumna, { configuracion: { operador: "MENOR" } });
  assert.equal(conOperador.mensaje, 'El año de "DIAGNOSTICO" debe ser menor al año de la ventana ({anioVentana})');

  // Cambiar a otro tipo con la sugerencia intacta la vacía (el marcador se vería literal).
  const otroTipo = cambioATipo(conOperador, "FECHA_NO_FUTURA");
  assert.equal(otroTipo.mensaje, "");
  assert.equal(otroTipo.configuracion, null);

  // Un mensaje escrito a mano nunca se pisa ni se vacía.
  const manual = aplicarCamposDerivados(conOperador, { mensaje: "Mensaje propio" });
  assert.equal(aplicarCamposDerivados(manual, { configuracion: { operador: "IGUAL" } }).mensaje, "Mensaje propio");
  assert.equal(cambioATipo(manual, "FECHA_NO_FUTURA").mensaje, "Mensaje propio");
  assert.equal(cambioATipo({ ...vacia, mensaje: "Otro" }, "COMPARACION_ANIO_VENTANA").mensaje, "Otro");

  // Si el mensaje cambia en el mismo cambio que el tipo, se respeta lo recibido.
  assert.equal(aplicarCamposDerivados(conOperador, { tipo: "FECHA_NO_FUTURA", configuracion: null, mensaje: "Nuevo" }).mensaje, "Nuevo");
});

// --- Ajuste en años (desplazamientoAnios) ---

function cumpleConAjuste(operador: OperadorComparacionFechas, desplazamientoAnios: number, valor: ValorCeldaArchivo): boolean {
  const regla: ReglaValidacionFormatoExcel = { ...reglaAnio(operador), configuracion: { operador, desplazamientoAnios } };
  return cumpleReglaValidacion(regla, { DIAGNOSTICO: valor }, contexto);
}

// Resultado esperado para un año efectivo menor, igual y mayor que el de la ventana.
const ESPERADO_POR_OPERADOR: Record<OperadorComparacionFechas, [boolean, boolean, boolean]> = {
  MENOR: [true, false, false],
  MENOR_IGUAL: [true, true, false],
  IGUAL: [false, true, false],
  MAYOR_IGUAL: [false, true, true],
  MAYOR: [false, false, true],
};

test("con ajuste +1 compara año + 1 contra la ventana con los cinco operadores (bordes incluidos)", () => {
  // 2024 → 2025 (menor), 2025 → 2026 (igual), 2026 → 2027 (mayor) frente a 2026.
  for (const [operador, resultados] of Object.entries(ESPERADO_POR_OPERADOR) as [OperadorComparacionFechas, boolean[]][]) {
    ["31-12-2024", "01-01-2025", "01-01-2026"].forEach((fecha, indice) =>
      assert.equal(cumpleConAjuste(operador, 1, fecha), resultados[indice], operador + " +1 " + fecha),
    );
  }
});

test("con ajuste -2 compara año - 2 contra la ventana con los cinco operadores (bordes incluidos)", () => {
  // 2027 → 2025, 2028 → 2026, 2029 → 2027 frente a 2026.
  for (const [operador, resultados] of Object.entries(ESPERADO_POR_OPERADOR) as [OperadorComparacionFechas, boolean[]][]) {
    ["31-12-2027", "01-01-2028", "01-01-2029"].forEach((fecha, indice) =>
      assert.equal(cumpleConAjuste(operador, -2, fecha), resultados[indice], operador + " -2 " + fecha),
    );
  }
});

test("sin ajuste equivale a 0, y con ajuste la celda vacía o no parseable sigue sin aplicar", () => {
  for (const operador of Object.keys(ESPERADO_POR_OPERADOR) as OperadorComparacionFechas[]) {
    assert.equal(cumple(operador, "15-06-2026"), cumpleConAjuste(operador, 0, "15-06-2026"));
  }
  assert.equal(cumpleConAjuste("IGUAL", 1, null), true);
  assert.equal(cumpleConAjuste("IGUAL", 1, ""), true);
  assert.equal(cumpleConAjuste("IGUAL", 1, "no es fecha"), true);
});

test("el esquema valida el ajuste en años y no persiste el 0", () => {
  const columnas = [{ nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA" }];
  const valida = { tipo: "COMPARACION_ANIO_VENTANA", columnas: ["DIAGNOSTICO"], mensaje: "m" };
  const conConfiguracion = (configuracion: Record<string, unknown>) =>
    crearFormatoExcelSchema.safeParse({ nombre: "F", columnas, reglasValidacion: [{ ...valida, configuracion }] });
  const conAjuste = (desplazamientoAnios: unknown) => conConfiguracion({ operador: "MENOR_IGUAL", desplazamientoAnios });

  for (const valor of [-100, 100, 1, -2]) {
    const resultado = conAjuste(valor);
    assert.equal(resultado.success, true, "acepta " + valor);
    assert.deepEqual(resultado.data?.reglasValidacion[0].configuracion, { operador: "MENOR_IGUAL", desplazamientoAnios: valor });
  }
  for (const valor of [1.5, 101, -101, "1", Number.NaN, null]) {
    assert.equal(conAjuste(valor).success, false, "rechaza " + String(valor));
  }
  assert.deepEqual(conAjuste(0).data?.reglasValidacion[0].configuracion, { operador: "MENOR_IGUAL" });
  assert.deepEqual(conConfiguracion({ operador: "MENOR_IGUAL" }).data?.reglasValidacion[0].configuracion, { operador: "MENOR_IGUAL" });
  assert.equal(conConfiguracion({ operador: "IGUAL", desplazamientoAnios: 1, extra: 1 }).success, false, "clave extra");
  assert.equal(
    conConfiguracion({ origen: { modo: "COLUMNA", columna: "DIAGNOSTICO" }, operador: "IGUAL", desplazamientoAnios: 1, referencia: { modo: "FIJA", fecha: "2024-01-01" } }).success,
    false,
    "mezcla con la forma de comparación entre dos fechas",
  );
});

test("el rechazo del ajuste llega con el mensaje específico en español, no el genérico de la unión", () => {
  const columnas = [{ nombre: "DIAGNOSTICO", requerida: false, tipoDato: "FECHA" }, { nombre: "INGRESO", requerida: false, tipoDato: "FECHA" }];
  const primerProblema = (regla: Record<string, unknown>) =>
    crearFormatoExcelSchema.safeParse({ nombre: "F", columnas, reglasValidacion: [regla] }).error?.issues[0];
  const anio = (desplazamientoAnios: unknown) =>
    primerProblema({ tipo: "COMPARACION_ANIO_VENTANA", columnas: ["DIAGNOSTICO"], mensaje: "m", configuracion: { operador: "IGUAL", desplazamientoAnios } });

  assert.equal(anio(101)?.message, "El ajuste en años no puede ser mayor que 100");
  assert.deepEqual(anio(101)?.path, ["reglasValidacion", 0, "configuracion", "desplazamientoAnios"]);
  assert.equal(anio(-101)?.message, "El ajuste en años no puede ser menor que -100");
  assert.equal(anio(1.5)?.message, "El ajuste en años debe ser un número entero");
  assert.equal(anio("1")?.message, "El ajuste en años debe ser un número entero");
  // La comparación entre dos fechas conserva su mensaje de campo.
  const fechas = primerProblema({
    tipo: "FECHA_POSTERIOR_O_IGUAL",
    columnas: [],
    mensaje: "m",
    configuracion: { origen: { modo: "COLUMNA", columna: "DIAGNOSTICO" }, operador: "IGUAL", referencia: { modo: "FIJA", fecha: "no-fecha" } },
  });
  assert.equal(fechas?.message, "Ingresa una fecha válida");
  assert.deepEqual(fechas?.path, ["reglasValidacion", 0, "configuracion", "referencia", "fecha"]);
});

test("la guarda acepta el ajuste entero y rechaza uno no entero", () => {
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL" }), true);
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL", desplazamientoAnios: 3 }), true);
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL", desplazamientoAnios: -100 }), true);
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL", desplazamientoAnios: 1.5 }), false);
  assert.equal(esConfiguracionComparacionAnioVentana({ operador: "IGUAL", desplazamientoAnios: "1" as unknown as number }), false);
});

test("la sugerencia escribe el ajuste con + o -", () => {
  assert.equal(
    mensajeSugeridoAnioVentana("X", "MENOR_IGUAL", 1),
    'El año de "X" + 1 debe ser menor o igual al año de la ventana ({anioVentana})',
  );
  assert.equal(mensajeSugeridoAnioVentana("X", "MAYOR", -2), 'El año de "X" - 2 debe ser mayor al año de la ventana ({anioVentana})');
  assert.equal(mensajeSugeridoAnioVentana("X", "IGUAL", 0), 'El año de "X" debe ser igual al año de la ventana ({anioVentana})');
});

test("cambiar el ajuste actualiza el mensaje solo si seguía siendo la sugerencia", () => {
  const base: ReglaValidacionEditable = {
    tipo: "COMPARACION_ANIO_VENTANA",
    columnas: ["DIAGNOSTICO"],
    configuracion: { operador: "MENOR_IGUAL" },
    mensaje: 'El año de "DIAGNOSTICO" debe ser menor o igual al año de la ventana ({anioVentana})',
  };
  assert.deepEqual(configuracionInicial("COMPARACION_ANIO_VENTANA"), { operador: "MAYOR_IGUAL" });
  const conMas1 = aplicarCamposDerivados(base, { configuracion: conDesplazamientoAnios("MENOR_IGUAL", "1") });
  assert.deepEqual(conMas1.configuracion, { operador: "MENOR_IGUAL", desplazamientoAnios: 1 });
  assert.equal(conMas1.mensaje, 'El año de "DIAGNOSTICO" + 1 debe ser menor o igual al año de la ventana ({anioVentana})');
  // Desde una sugerencia con ajuste, cambiar el ajuste otra vez también la actualiza.
  const conMenos2 = aplicarCamposDerivados(conMas1, { configuracion: conDesplazamientoAnios("MENOR_IGUAL", "-2") });
  assert.equal(conMenos2.mensaje, 'El año de "DIAGNOSTICO" - 2 debe ser menor o igual al año de la ventana ({anioVentana})');
  // Cambiar el operador conserva el ajuste en la sugerencia.
  const otroOperador = aplicarCamposDerivados(conMenos2, { configuracion: { operador: "MAYOR", desplazamientoAnios: -2 } });
  assert.equal(otroOperador.mensaje, 'El año de "DIAGNOSTICO" - 2 debe ser mayor al año de la ventana ({anioVentana})');
  // Vacío = 0 y no se guarda.
  const sinAjuste = aplicarCamposDerivados(conMenos2, { configuracion: conDesplazamientoAnios("MENOR_IGUAL", "") });
  assert.deepEqual(sinAjuste.configuracion, { operador: "MENOR_IGUAL" });
  assert.equal(sinAjuste.mensaje, base.mensaje);
  // Un mensaje escrito a mano no se pisa.
  const manual = { ...conMas1, mensaje: "Propio" };
  assert.equal(aplicarCamposDerivados(manual, { configuracion: conDesplazamientoAnios("MENOR_IGUAL", "3") }).mensaje, "Propio");
  // Errores del campo en el editor, mismo criterio que Zod.
  assert.equal(errorDesplazamientoAnios(undefined), null);
  assert.equal(errorDesplazamientoAnios(-100), null);
  assert.equal(errorDesplazamientoAnios(100), null);
  assert.notEqual(errorDesplazamientoAnios(1.5), null);
  assert.notEqual(errorDesplazamientoAnios(101), null);
  assert.notEqual(errorDesplazamientoAnios(-101), null);
  assert.notEqual(errorDesplazamientoAnios(Number.NaN), null);
});
