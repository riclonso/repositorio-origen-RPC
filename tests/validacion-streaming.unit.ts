// RF-38: motor de validación fila a fila (`MotorValidacionFilas`): buffer de filas vacías
// (con y sin `FILA_VACIA`, intermedias, al final, huecos sin `<row>`, archivo sin datos, columnas
// inesperadas), acumulador de errores (499 + resumen con el tipo del 500), tope de filas con un tope
// inyectable, `FILA_DUPLICADA` con clave resumida y texto enriquecido. Sin base de datos.
//
//   npx tsx tests/validacion-streaming.unit.ts
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { FormatoExcelRepository } from "../src/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import type { CargaArchivoRepository } from "../src/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { VentanaCargaRepository } from "../src/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { ValidadorArchivoReporte } from "../src/modules/reporte-excel/application/ports";
import { procesarCargaArchivo } from "../src/modules/reporte-excel/application/use-cases/ProcesarCargaArchivo";
import { validarXlsxEnStreaming } from "../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
import type { FormatoExcel, ReglaValidacionFormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ResultadoValidacionArchivo, ValorCeldaArchivo } from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  MENSAJE_TEXTO_ENRIQUECIDO_CELDA,
  MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO,
  MENSAJE_TOPE_FILAS_EXCEDIDO,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import { crearMotorValidacionFilas } from "../src/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import {
  crearRastreadorFilasDuplicadas,
  evaluarFilaDuplicada,
} from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";

let fallos = 0;
let ejecutadas = 0;

async function prueba(nombre: string, cuerpo: () => void | Promise<void>): Promise<void> {
  ejecutadas += 1;
  try {
    await cuerpo();
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`FALLA ${nombre}`);
    console.error(error);
  }
}

const VENTANA = { anio: 2024, fechaApertura: new Date(Date.UTC(2025, 0, 1)), fechaVencimiento: new Date(Date.UTC(2025, 11, 31)) };
const VACIA = "No se permiten filas vacías";

function regla(orden: number, tipo: ReglaValidacionFormatoExcel["tipo"], columnas: string[], mensaje: string): ReglaValidacionFormatoExcel {
  return { id: `r${orden}`, orden, tipo, columnas, mensaje };
}

function formato(reglas: ReglaValidacionFormatoExcel[]): FormatoExcel {
  return {
    id: "f",
    nombre: "F",
    descripcion: null,
    nombreArchivoPlantilla: "p.xlsx",
    tipoContenidoPlantilla: "x",
    tipoArchivo: "EXCEL",
    separadorCsv: null,
    activo: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    columnas: [
      { id: "1", orden: 1, nombre: "A", requerida: true, tipoDato: "TEXTO", tipoEnumeradoNombre: null },
      { id: "2", orden: 2, nombre: "B", requerida: false, tipoDato: "ENTERO", tipoEnumeradoNombre: null },
    ],
    reglasValidacion: reglas,
    tiposEnumerados: [],
  };
}

type FilaEntrada = { n: number; v: ValorCeldaArchivo[]; e?: boolean[] };

function validar(
  reglas: ReglaValidacionFormatoExcel[],
  filas: FilaEntrada[],
  opciones: { encabezados?: { texto: string; enriquecido: boolean }[]; ultimaFila?: number; tope?: number } = {},
): ResultadoValidacionArchivo {
  const motor = crearMotorValidacionFilas({ formato: formato(reglas), ventana: VENTANA, topeFilasDatos: opciones.tope });
  motor.procesarEncabezados(opciones.encabezados ?? [{ texto: "A", enriquecido: false }, { texto: "B", enriquecido: false }]);
  let ultima = 1;
  for (const fila of filas) {
    ultima = Math.max(ultima, fila.n);
    if (motor.procesarFila(fila.n, fila.v, fila.e) === "DETENER") break;
  }
  return motor.finalizar(opciones.ultimaFila ?? ultima);
}

function resumen(resultado: ResultadoValidacionArchivo): string[] {
  return resultado.errores.map((error) => `${error.numeroFila}|${error.columna ?? "-"}|${error.tipoError}`);
}

async function main(): Promise<void> {
  const conVacia = [regla(1, "FILA_VACIA", [], VACIA)];

  await prueba("vacías intermedias con FILA_VACIA: un error por fila, incluidos los huecos sin <row>", () => {
    const resultado = validar(conVacia, [{ n: 2, v: ["x", 1] }, { n: 3, v: [null, " "] }, { n: 6, v: ["y", 2] }]);
    assert.deepEqual(resumen(resultado), ["3|-|REGLA_VALIDACION", "4|-|REGLA_VALIDACION", "5|-|REGLA_VALIDACION"]);
    assert.equal(resultado.cantidadFilasDatos, 5);
  });

  await prueba("vacías intermedias sin FILA_VACIA: se validan como filas de null (requeridas)", () => {
    const resultado = validar([], [{ n: 2, v: ["x", 1] }, { n: 4, v: ["y", 2] }]);
    assert.deepEqual(resumen(resultado), ["3|A|VALOR_REQUERIDO_VACIO"]);
  });

  await prueba("vacías al final: con FILA_VACIA se recortan; sin ella se validan y cuentan hasta la última fila", () => {
    const conRegla = validar(conVacia, [{ n: 2, v: ["x", 1] }, { n: 5, v: [null, null] }], { ultimaFila: 7 });
    assert.deepEqual(resumen(conRegla), []);
    assert.equal(conRegla.cantidadFilasDatos, 1);
    assert.equal(conRegla.estado, "PENDIENTE_VISTO_BUENO");

    const sinRegla = validar([], [{ n: 2, v: ["x", 1] }], { ultimaFila: 4 });
    assert.deepEqual(resumen(sinRegla), ["3|A|VALOR_REQUERIDO_VACIO", "4|A|VALOR_REQUERIDO_VACIO"]);
    assert.equal(sinRegla.cantidadFilasDatos, 3);
  });

  await prueba("archivo sin datos: SIN_FILAS_DATOS y 0 filas, con y sin la regla", () => {
    for (const reglas of [conVacia, []]) {
      const resultado = validar(reglas, [{ n: 3, v: [null, null] }], { ultimaFila: 9 });
      assert.deepEqual(resumen(resultado), ["0|-|SIN_FILAS_DATOS"]);
      assert.equal(resultado.cantidadFilasDatos, 0);
    }
  });

  await prueba("columnas inesperadas: no valida filas pero cuenta como antes", () => {
    const resultado = validar([], [{ n: 2, v: ["x", "no", "z"] }, { n: 3, v: [null, null, null] }], {
      encabezados: [{ texto: "A", enriquecido: false }, { texto: "B", enriquecido: false }, { texto: "C", enriquecido: false }],
    });
    assert.deepEqual(resumen(resultado), ["1|C|COLUMNA_INESPERADA"]);
    assert.equal(resultado.cantidadFilasDatos, 2);
  });

  await prueba("acumulador: 499 + resumen con el tipo del error 500 y total real", () => {
    const filas: FilaEntrada[] = Array.from({ length: 700 }, (_, indice) => ({ n: indice + 2, v: ["x", "no"] }));
    filas[499] = { n: 501, v: [null, 1] }; // el error 500 es VALOR_REQUERIDO_VACIO
    const resultado = validar([], filas);
    assert.equal(resultado.errores.length, 500);
    assert.equal(resultado.cantidadErrores, 700);
    assert.equal(resultado.errores[499].tipoError, "VALOR_REQUERIDO_VACIO");
    assert.equal(resultado.errores[499].mensaje, "... y 201 errores más");
  });

  await prueba("tope: dato en la fila tope+1 es válido; en tope+2 da TOPE_FILAS_EXCEDIDO y se detiene", () => {
    const enTope = validar([], [{ n: 2, v: ["x", 1] }, { n: 11, v: ["y", 2] }], { tope: 10 });
    assert.ok(!enTope.errores.some((error) => error.tipoError === "TOPE_FILAS_EXCEDIDO"));

    const excedido = validar(conVacia, [{ n: 2, v: ["x", 1] }, { n: 12, v: ["y", 2] }, { n: 13, v: ["z", "no"] }], { tope: 10 });
    const tipos = excedido.errores.map((error) => error.tipoError);
    assert.equal(tipos.filter((tipo) => tipo === "REGLA_VALIDACION").length, 9, "vacías 3..11 dentro del tope");
    assert.equal(excedido.errores.at(-1)?.mensaje, MENSAJE_TOPE_FILAS_EXCEDIDO);
    assert.equal(excedido.cantidadFilasDatos, 10);
    assert.equal(excedido.estado, "CON_ERRORES");
    assert.ok(!tipos.includes("TIPO_DATO_INVALIDO"), "la fila 13 no se lee");
  });

  await prueba("tope: vacías más allá del tope no lo disparan", () => {
    const resultado = validar(conVacia, [{ n: 2, v: ["x", 1] }, { n: 40, v: [null, null] }], { tope: 10 });
    assert.deepEqual(resumen(resultado), []);
  });

  await prueba("FILA_DUPLICADA con clave resumida: misma decisión que la clave textual", () => {
    const reglaDup = regla(1, "FILA_DUPLICADA", ["A", "B"], "dup");
    const rastreador = crearRastreadorFilasDuplicadas([reglaDup]);
    const decisiones = [
      { A: "Juan", B: 1 },
      { A: "JUAN", B: 1 },
      { A: "Juan ", B: 1 },
      { A: null, B: null },
      { A: null, B: null },
      { A: "null", B: null },
      { A: null, B: null },
    ].map((fila) => evaluarFilaDuplicada(rastreador, reglaDup, fila));
    assert.deepEqual(decisiones, [false, false, true, false, false, false, false]);
  });

  await prueba("texto enriquecido: error por celda (no en vacías) y por encabezado, sin contenido", () => {
    const resultado = validar([], [{ n: 2, v: ["x", 1], e: [true, false] }, { n: 3, v: [" ", 2], e: [true, false] }], {
      encabezados: [{ texto: "A", enriquecido: true }, { texto: "B", enriquecido: false }],
    });
    assert.deepEqual(resumen(resultado), ["1|A|TEXTO_ENRIQUECIDO", "2|A|TEXTO_ENRIQUECIDO", "3|A|VALOR_REQUERIDO_VACIO"]);
    assert.equal(resultado.errores[0].mensaje, MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO);
    assert.equal(resultado.errores[1].mensaje, MENSAJE_TEXTO_ENRIQUECIDO_CELDA);
  });

  // --- ProcesarCargaArchivo con el validador real sobre un archivo con números de fila repetidos ---

  const base = new ExcelJS.Workbook();
  base.addWorksheet("D").addRow(["A", "B"]);
  const zip = await JSZip.loadAsync(Buffer.from(await base.xlsx.writeBuffer()));
  const rutaHoja = Object.keys(zip.files).find((nombre) => /worksheets\/sheet1\.xml$/.test(nombre)) ?? "";
  const xml = (await zip.file(rutaHoja)?.async("string")) ?? "";
  const filasRepetidas = Array.from({ length: 50 }, (_, indice) => `<row r="2"><c r="A2" t="inlineStr"><is><t>v${indice}</t></is></c></row>`);
  zip.file(rutaHoja, xml.replace(/<\/row>/, `</row>${filasRepetidas.join("")}`));
  const repetidas = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

  function dobles(opciones: { formatoFalla?: boolean } = {}) {
    let completado: ResultadoValidacionArchivo | null = null;
    const repositorio = {
      obtenerParaProcesar: async () => ({ id: "c", formatoExcelId: "f", ventanaCargaId: "v", usuarioId: "u", estado: "PROCESANDO", rutaArchivo: "2024/c.xlsx" }),
      completarProcesamiento: async (_id: string, resultado: ResultadoValidacionArchivo) => {
        completado = resultado;
        return true;
      },
    } as unknown as CargaArchivoRepository;
    const repositorioFormatosExcel = {
      obtenerPorId: async () => {
        if (opciones.formatoFalla) throw new Error("conexión perdida");
        return formato([regla(1, "FILA_DUPLICADA", ["A"], "dup")]);
      },
    } as unknown as FormatoExcelRepository;
    const repositorioVentanasCarga = { obtenerPorId: async () => VENTANA } as unknown as VentanaCargaRepository;
    const validador: ValidadorArchivoReporte = {
      validar: (_fuente, formatoValidado, ventana) => validarXlsxEnStreaming({ buffer: repetidas }, formatoValidado, ventana, { topeFilasDatos: 10 }),
    };
    return { dependencias: { repositorio, repositorioFormatosExcel, repositorioVentanasCarga, validador }, completado: () => completado };
  }

  await prueba("ProcesarCargaArchivo: filas con r repetido → CON_ERRORES con ARCHIVO_NO_PROCESADO (nunca PROCESANDO)", async () => {
    const { dependencias, completado } = dobles();
    const resultado = await procesarCargaArchivo("c", dependencias);
    assert.equal(resultado.estado, "NO_PROCESADA");
    assert.equal(completado()?.estado, "CON_ERRORES");
    assert.deepEqual(completado()?.errores.map((error) => error.tipoError), ["ARCHIVO_NO_PROCESADO"]);
  });

  await prueba("ProcesarCargaArchivo: un fallo de la BD al leer el formato se propaga y no marca el archivo", async () => {
    const { dependencias, completado } = dobles({ formatoFalla: true });
    await assert.rejects(() => procesarCargaArchivo("c", dependencias), /conexión perdida/);
    assert.equal(completado(), null);
  });

  console.log(`\n${ejecutadas - fallos}/${ejecutadas} pruebas OK`);
  if (fallos > 0) process.exitCode = 1;
}

void main();
