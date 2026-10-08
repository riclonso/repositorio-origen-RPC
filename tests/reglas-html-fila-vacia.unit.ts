// RF-32: reglas `CONTENIDO_HTML` y `FILA_VACIA`, más el rechazo global `SIN_FILAS_DATOS` cuando
// el archivo no trae ninguna fila con datos. Sin base de datos. RF-38: los casos de subida se ejecutan
// sobre el motor de validación en streaming (`MotorValidacionFilas`), y el del lector real sobre el
// validador completo; la publicación de filas al aprobar ya no existe.
//
//   npx tsx tests/reglas-html-fila-vacia.unit.ts
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { contieneHtml } from "../src/modules/reporte-excel/infrastructure/validacion/DetectorContenidoHtml";
import { columnasConContenidoHtml } from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import {
  filaCompletamenteVacia,
  indiceUltimaFilaConDatos,
} from "../src/modules/reporte-excel/domain/reglas/filasArchivo";
import { etiquetaFila } from "../src/shared/utils/erroresCargaArchivo";
import { crearFormatoExcelSchema } from "../src/modules/formatos-excel/schemas/formato-excel.schema";
import { crearMotorValidacionFilas } from "../src/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import { validarXlsxEnStreaming } from "../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
import type {
  FormatoExcel,
  ReglaValidacionFormatoExcel,
  TipoReglaValidacion,
} from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import type {
  ResultadoValidacionArchivo,
  ValorCeldaArchivo,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivo";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MENSAJE_HTML = "La celda trae contenido HTML";
const MENSAJE_FILA_VACIA = "No se permiten filas vacías";

type Fila = Record<string, ValorCeldaArchivo>;

// ---------------------------------------------------------------------------------------------
// 1. Detector
// ---------------------------------------------------------------------------------------------
function probarDetector(): void {
  const conHtml = [
    "<p>texto</p>",
    "</p>",
    "<br>",
    "<br/>",
    "<BR />",
    '<a href="https://x.cl">x</a>',
    "<script>alert(1)</script>",
    "<b>5</b>",
    '<span style="color:red">',
    "<o:p></o:p>",
    "<!-- comentario -->",
    "<!DOCTYPE html>",
    "Juan&nbsp;Pérez",
    "A &amp; B",
    "&lt;5",
    "O&#39;Higgins",
    "O&#x27;Higgins",
    "<svg/onload=1>",
    '<?xml:namespace prefix="o" ns="urn:schemas-microsoft-com:office:office" />',
    "<?xml version=\"1.0\"?>",
    "<big>texto</big>",
    "<w:sdt>",
    "<st1:place>Santiago</st1:place>",
    // Falsos positivos conocidos y aceptados (documentados en el detector).
    "a<b y c>d",
    "edad <a 18 y >65",
    "talla <p 3 y >p 97",
    "Juan&Pedro;",
  ];
  const sinHtml = [
    "<5 años",
    "a < b",
    ">= 10",
    "x<y",
    "3 <> 4",
    "<sin dato>",
    "<NA>",
    "<desconocido>",
    "Hospital A & B",
    "R&D",
    "AT&T",
    "&",
    "5 & 6",
    "&nbsp",
    "email@dominio.cl",
    "Ñuñoa",
    "",
    // Notación TNM de oncología: no son prefijos de Office.
    "<T1:N0>",
    "<pT2:N1>",
    "<T2:N1:M0>",
    "<cT3:N2>",
    // Unidades y abreviaturas con `/`: la barra solo separa atributos si sigue un `=`.
    "<u/l>",
    "ratio <u/l>",
    "<s/n>",
    "<i/o>",
    "<a/b>",
  ];

  for (const texto of conHtml) assert.equal(contieneHtml(texto), true, `debería detectar HTML: ${texto}`);
  for (const texto of sinHtml) assert.equal(contieneHtml(texto), false, `no debería detectar HTML: ${texto}`);

  // Anti-ReDoS: miles de `<` sin cerrar, `<p ` sin `>` y `<!--` sin `-->` deben resolverse rápido.
  const casosPatologicos = [
    "<".repeat(30_000),
    "<p ".repeat(10_000),
    "<p/".repeat(10_000),
    `<svg${"/".repeat(30_000)}`,
    "<o:".repeat(10_000),
    "<!--".repeat(7_500),
    `<p${" ".repeat(30_000)}`,
    "&a".repeat(15_000),
  ];
  for (const texto of casosPatologicos) {
    const inicio = performance.now();
    assert.equal(contieneHtml(texto), false);
    const duracion = performance.now() - inicio;
    assert.ok(duracion < 200, `detector demasiado lento (${duracion.toFixed(1)} ms) ante entrada patológica`);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Evaluador
// ---------------------------------------------------------------------------------------------
function probarEvaluador(): void {
  assert.equal(filaCompletamenteVacia({ a: " ", b: "", c: null }), true);
  assert.equal(filaCompletamenteVacia({}), true);
  assert.equal(filaCompletamenteVacia({ a: 0, b: null }), false);
  assert.equal(filaCompletamenteVacia({ a: false, b: null }), false);

  const llena: Fila = { a: "x" };
  const vacia: Fila = { a: null };
  assert.equal(indiceUltimaFilaConDatos([llena, vacia, llena, vacia, vacia]), 2);
  assert.equal(indiceUltimaFilaConDatos([llena, vacia, llena]), 2);
  assert.equal(indiceUltimaFilaConDatos([vacia, vacia]), -1);
  assert.equal(indiceUltimaFilaConDatos([]), -1);

  assert.deepEqual(
    columnasConContenidoHtml(
      { a: "<p>x</p>", b: 5, c: new Date(), d: true, e: "texto", f: "A&amp;B" },
      ["a", "b", "c", "d", "e", "f"],
    ),
    ["a", "f"],
  );
}

// ---------------------------------------------------------------------------------------------
// 3. Esquema
// ---------------------------------------------------------------------------------------------
function payloadFormato(reglas: { tipo: TipoReglaValidacion; columnas: string[]; mensaje: string }[]) {
  return {
    nombre: "Formato de prueba",
    columnas: [
      { nombre: "Nombre", requerida: true, tipoDato: "TEXTO" },
      { nombre: "Edad", requerida: true, tipoDato: "ENTERO" },
    ],
    reglasValidacion: reglas,
  };
}

function mensajesDeError(entrada: unknown): string[] {
  const resultado = crearFormatoExcelSchema.safeParse(entrada);
  return resultado.success ? [] : resultado.error.issues.map((issue) => issue.message);
}

function probarEsquema(): void {
  assert.deepEqual(
    mensajesDeError(
      payloadFormato([
        { tipo: "CONTENIDO_HTML", columnas: [], mensaje: MENSAJE_HTML },
        { tipo: "FILA_VACIA", columnas: [], mensaje: MENSAJE_FILA_VACIA },
      ]),
    ),
    [],
  );

  const conColumnas = mensajesDeError(
    payloadFormato([{ tipo: "CONTENIDO_HTML", columnas: ["Nombre"], mensaje: MENSAJE_HTML }]),
  );
  assert.ok(conColumnas.some((mensaje) => mensaje.includes("no admite columnas")));

  const repetidas = mensajesDeError(
    payloadFormato([
      { tipo: "FILA_VACIA", columnas: [], mensaje: MENSAJE_FILA_VACIA },
      { tipo: "FILA_VACIA", columnas: [], mensaje: "Otra" },
    ]),
  );
  // El mensaje usa la etiqueta visible del editor, no el código del enum.
  assert.ok(
    repetidas.some((mensaje) => mensaje.includes("«Sin filas vacías entre filas con datos»")),
    `mensaje de duplicado inesperado: ${repetidas.join(" | ")}`,
  );
  assert.ok(repetidas.every((mensaje) => !mensaje.includes("FILA_VACIA")));

  const htmlRepetidas = mensajesDeError(
    payloadFormato([
      { tipo: "CONTENIDO_HTML", columnas: [], mensaje: MENSAJE_HTML },
      { tipo: "CONTENIDO_HTML", columnas: [], mensaje: "Otra" },
    ]),
  );
  assert.ok(htmlRepetidas.some((mensaje) => mensaje.includes("«Sin contenido HTML en las celdas»")));

  const tiposExistentes: TipoReglaValidacion[] = [
    "ALGUNA_COLUMNA_CON_VALOR",
    "FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA",
    "FILA_DUPLICADA",
    "RUT_VALIDO",
  ];
  for (const tipo of tiposExistentes) {
    const errores = mensajesDeError(payloadFormato([{ tipo, columnas: [], mensaje: "x" }]));
    assert.ok(errores.includes("Selecciona al menos una columna"), `${tipo} con [] debe seguir rechazándose`);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Caso de uso con dobles en memoria
// ---------------------------------------------------------------------------------------------
const FORMATO_ID = "formato-1";
const ENCABEZADOS = ["Nombre", "Edad", "Comentario"];

function regla(tipo: TipoReglaValidacion, mensaje: string, orden: number): ReglaValidacionFormatoExcel {
  return { id: `regla-${orden}`, orden, tipo, columnas: [], mensaje };
}

function formatoCon(reglas: ReglaValidacionFormatoExcel[]): FormatoExcel {
  return {
    id: FORMATO_ID,
    nombre: "Formato de prueba",
    descripcion: null,
    nombreArchivoPlantilla: "plantilla.xlsx",
    tipoContenidoPlantilla: TIPO_XLSX,
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    columnas: [
      { id: "c1", orden: 1, nombre: "Nombre", requerida: true, tipoDato: "TEXTO", tipoEnumeradoNombre: null },
      { id: "c2", orden: 2, nombre: "Edad", requerida: true, tipoDato: "ENTERO", tipoEnumeradoNombre: null },
      { id: "c3", orden: 3, nombre: "Comentario", requerida: false, tipoDato: "TEXTO", tipoEnumeradoNombre: null },
    ],
    reglasValidacion: reglas,
    tiposEnumerados: [],
  };
}

const ventanaAbierta = {
  anio: new Date().getFullYear(),
  fechaApertura: new Date(2000, 0, 1),
  fechaVencimiento: new Date(2100, 0, 1),
};

function fila(nombre: ValorCeldaArchivo, edad: ValorCeldaArchivo, comentario: ValorCeldaArchivo = null): Fila {
  return { Nombre: nombre, Edad: edad, Comentario: comentario };
}

const FILA_VACIA_RESIDUAL = fila(null, null, null);

// Valida filas ya leídas (fila 1 = encabezados, `filas[i]` = fila `i + 2`) con el motor de RF-38 y
// devuelve lo que se persistiría.
async function ejecutar(
  reglas: ReglaValidacionFormatoExcel[],
  filas: Fila[],
  encabezados: string[] = ENCABEZADOS,
): Promise<ResultadoValidacionArchivo> {
  const motor = crearMotorValidacionFilas({ formato: formatoCon(reglas), ventana: ventanaAbierta });
  motor.procesarEncabezados(encabezados.map((texto) => ({ texto, enriquecido: false })));
  filas.forEach((registro, indice) => {
    motor.procesarFila(indice + 2, encabezados.map((encabezado) => registro[encabezado] ?? null));
  });
  return motor.finalizar(filas.length + 1);
}

async function probarCasoDeUso(): Promise<void> {
  const reglaVacia = regla("FILA_VACIA", MENSAJE_FILA_VACIA, 1);
  const reglaHtml = regla("CONTENIDO_HTML", MENSAJE_HTML, 2);

  // Fila 4 (índice 2) vacía entre filas con datos.
  const conVaciaIntermedia = [fila("Ana", 30), fila("Luis", 40), FILA_VACIA_RESIDUAL, fila("Eva", 50)];

  // Con la regla: un solo error en la fila 4, sin `VALOR_REQUERIDO_VACIO`.
  const conRegla = await ejecutar([reglaVacia], conVaciaIntermedia);
  assert.deepEqual(conRegla.errores, [
    { numeroFila: 4, columna: null, tipoError: "REGLA_VALIDACION", mensaje: MENSAJE_FILA_VACIA },
  ]);
  assert.equal(conRegla.estado, "CON_ERRORES");
  assert.equal(conRegla.cantidadFilasDatos, 4);

  // Sin la regla: comportamiento previo (un `VALOR_REQUERIDO_VACIO` por columna requerida).
  const sinRegla = await ejecutar([], conVaciaIntermedia);
  assert.deepEqual(
    sinRegla.errores.map((error) => [error.numeroFila, error.columna, error.tipoError]),
    [
      [4, "Nombre", "VALOR_REQUERIDO_VACIO"],
      [4, "Edad", "VALOR_REQUERIDO_VACIO"],
    ],
  );

  // Vacías solo al final, con la regla: sin errores y no cuentan en `cantidadFilasDatos`.
  const conResiduos = [fila("Ana", 30), fila("Luis", 40), FILA_VACIA_RESIDUAL, FILA_VACIA_RESIDUAL];
  const residuosConRegla = await ejecutar([reglaVacia], conResiduos);
  assert.deepEqual(residuosConRegla.errores, []);
  assert.equal(residuosConRegla.estado, "PENDIENTE_VISTO_BUENO");
  assert.equal(residuosConRegla.cantidadFilasDatos, 2);

  // Sin la regla, los residuos del final siguen contándose y validándose como hoy.
  const residuosSinRegla = await ejecutar([], conResiduos);
  assert.equal(residuosSinRegla.cantidadFilasDatos, 4);
  assert.equal(residuosSinRegla.errores.length, 4);

  // Global: encabezado + solo residuos → `SIN_FILAS_DATOS` y `cantidadFilasDatos = 0`, con y
  // sin la regla.
  for (const reglas of [[reglaVacia], []]) {
    const soloResiduos = await ejecutar(reglas, [FILA_VACIA_RESIDUAL, FILA_VACIA_RESIDUAL, FILA_VACIA_RESIDUAL]);
    assert.deepEqual(
      soloResiduos.errores.map((error) => error.tipoError),
      ["SIN_FILAS_DATOS"],
    );
    assert.equal(soloResiduos.estado, "CON_ERRORES");
    assert.equal(soloResiduos.cantidadFilasDatos, 0);
  }

  // Sin ningún encabezado reconocido: solo `COLUMNA_FALTANTE` (no "parece estar vacío", que sería
  // falso) y `cantidadFilasDatos = 0`, con y sin la regla.
  for (const reglas of [[reglaVacia], []]) {
    const sinEncabezados = await ejecutar(reglas, [{}, {}], []);
    assert.deepEqual(
      sinEncabezados.errores.map((error) => error.tipoError),
      ["COLUMNA_FALTANTE", "COLUMNA_FALTANTE", "COLUMNA_FALTANTE"],
    );
    assert.ok(sinEncabezados.errores.every((error) => error.numeroFila === 1));
    assert.equal(sinEncabezados.cantidadFilasDatos, 0);
  }

  // Global: solo encabezado → `SIN_FILAS_DATOS`, con y sin la regla.
  for (const reglas of [[reglaVacia], []]) {
    const soloEncabezado = await ejecutar(reglas, []);
    assert.deepEqual(
      soloEncabezado.errores.map((error) => error.tipoError),
      ["SIN_FILAS_DATOS"],
    );
  }

  // HTML en dos celdas de una fila: dos errores, cada uno con su columna. `<b>5</b>` en ENTERO
  // además falla su tipo de dato (dos causas distintas, ambas reportadas).
  const conHtml = await ejecutar([reglaHtml], [fila("Ana", 30), fila("<p>Luis</p>", "<b>5</b>", "sin html")]);
  assert.deepEqual(
    conHtml.errores.map((error) => [error.numeroFila, error.columna, error.tipoError, error.mensaje]),
    [
      [3, "Edad", "TIPO_DATO_INVALIDO", conHtml.errores[0].mensaje],
      [3, "Nombre", "REGLA_VALIDACION", MENSAJE_HTML],
      [3, "Edad", "REGLA_VALIDACION", MENSAJE_HTML],
    ],
  );
  // El mensaje nunca incluye el contenido de la celda.
  assert.ok(conHtml.errores.every((error) => !error.mensaje.includes("<p>") && !error.mensaje.includes("<b>")));

  // Más de 500 errores de HTML: aparece la fila resumen y `cantidadErrores` guarda el total real.
  const muchasConHtml = Array.from({ length: 600 }, () => fila("<br>", 1));
  const acotado = await ejecutar([reglaHtml], muchasConHtml);
  assert.equal(acotado.errores.length, 500);
  assert.equal(acotado.cantidadErrores, 600);
  assert.equal(acotado.errores[499].numeroFila, 0);
  assert.ok(acotado.errores[499].mensaje.includes("101 errores más"));
}

// ---------------------------------------------------------------------------------------------
// 5. Lector real: una fila 50 con solo estilo (sin valores) llega al validador y la regla
//    `FILA_VACIA` la trata como residuo del final.
// ---------------------------------------------------------------------------------------------
async function probarLectorReal(): Promise<void> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Datos");
  hoja.addRow(ENCABEZADOS);
  hoja.addRow(["Ana", 30, null]);
  hoja.addRow(["Luis", 40, "ok"]);
  const filaResidual = hoja.getRow(50);
  filaResidual.height = 30;
  filaResidual.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

  const contenido = Buffer.from(await libro.xlsx.writeBuffer());

  // La fila 50 (solo estilo) llega como residuo del final: con la regla no se valida ni se cuenta.
  const conRegla = await validarXlsxEnStreaming(
    { buffer: contenido },
    formatoCon([regla("FILA_VACIA", MENSAJE_FILA_VACIA, 1)]),
    ventanaAbierta,
  );
  assert.deepEqual(conRegla.errores, []);
  assert.equal(conRegla.cantidadFilasDatos, 2);

  // Sin la regla se cuentan hasta la fila 50, como `rowCount` en memoria.
  const sinRegla = await validarXlsxEnStreaming({ buffer: contenido }, formatoCon([]), ventanaAbierta);
  assert.equal(sinRegla.cantidadFilasDatos, 49);
}

// La etiqueta de la columna "Fila" del informe depende del tipo de error cuando la fila es 0.
function probarEtiquetaFila(): void {
  assert.equal(etiquetaFila(7, "REGLA_VALIDACION"), "7");
  assert.equal(etiquetaFila(0, "COLUMNA_FALTANTE"), "1");
  assert.equal(etiquetaFila(1, "COLUMNA_FALTANTE"), "1");
  assert.equal(etiquetaFila(0, "COLUMNA_INESPERADA"), "1");
  assert.equal(etiquetaFila(0, "SIN_FILAS_DATOS"), "Archivo");
  assert.equal(etiquetaFila(0, "REGLA_VALIDACION"), "—");
}

async function main(): Promise<void> {
  probarEtiquetaFila();
  probarDetector();
  probarEvaluador();
  probarEsquema();
  await probarCasoDeUso();
  await probarLectorReal();
  console.log("OK: RF-32 detector HTML, filas vacías, esquema, motor de validación, SIN_FILAS_DATOS global y lector real");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
