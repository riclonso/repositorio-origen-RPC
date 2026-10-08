// RF-38: EQUIVALENCIA entre la validación en memoria de antes de RF-38
// (referencia congelada, `tests/referencia/validacionEnMemoria.ts`) y la validación en streaming de
// producción (`ValidadorArchivoReporteStreaming`), archivo por archivo y formato por formato. Se
// comparan `estado`, `cantidadFilasDatos`, `cantidadErrores` y la lista EXACTA de errores persistidos
// (orden, fila, columna, tipo y mensaje). Requisito de aprobación: cero diferencias, salvo la
// excepción aprobada del texto enriquecido, cuyo resultado nuevo se afirma explícitamente.
//
// Ambos lados usan el mismo tope de filas (500.000), para poder comparar también archivos de más de
// 20.000 filas (antes de RF-38 el tope era 20.000 y las filas sobrantes se ignoraban).
//
// Corpus extra opcional (archivos reales, NUNCA versionados): `CORPUS_EXTRA_DIR` con pares
// `<nombre>.xlsx` + `<nombre>.json` (`{ formato, ventana }`, fechas en ISO).
//
//   npx tsx tests/equivalencia-validacion.unit.ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FormatoExcel } from "../src/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  MENSAJE_TEXTO_ENRIQUECIDO_CELDA,
  MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO,
  TOPE_FILAS_DATOS,
} from "../src/modules/reporte-excel/domain/entities/CargaArchivo";
import type { ContextoEvaluacionReglas } from "../src/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";
import { validarXlsxEnStreaming } from "../src/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
import { validarEnMemoriaReferencia, type ResultadoValidacionReferencia } from "./referencia/validacionEnMemoria";
import { FORMATOS_PRUEBA, VENTANA_PRUEBA } from "./fixtures/equivalencia/formatosPrueba";
import { generarCorpus, type CasoCorpus } from "./fixtures/equivalencia/generarCorpus";

type Ventana = ContextoEvaluacionReglas["ventana"];

let comparaciones = 0;
let diferencias = 0;

function describirError(error: ResultadoValidacionReferencia["errores"][number]): string {
  return `${error.numeroFila}|${error.columna ?? "∅"}|${error.tipoError}|${error.mensaje}`;
}

function primeraDiferencia(esperado: ResultadoValidacionReferencia, obtenido: ResultadoValidacionReferencia): string | null {
  if (esperado.estado !== obtenido.estado) return `estado ${esperado.estado} ≠ ${obtenido.estado}`;
  if (esperado.cantidadFilasDatos !== obtenido.cantidadFilasDatos) {
    return `cantidadFilasDatos ${esperado.cantidadFilasDatos} ≠ ${obtenido.cantidadFilasDatos}`;
  }
  if (esperado.cantidadErrores !== obtenido.cantidadErrores) {
    return `cantidadErrores ${esperado.cantidadErrores} ≠ ${obtenido.cantidadErrores}`;
  }
  const largo = Math.max(esperado.errores.length, obtenido.errores.length);
  for (let indice = 0; indice < largo; indice += 1) {
    const izquierda = esperado.errores[indice];
    const derecha = obtenido.errores[indice];
    if (!izquierda || !derecha || describirError(izquierda) !== describirError(derecha)) {
      return `error #${indice}: ${izquierda ? describirError(izquierda) : "—"} ≠ ${derecha ? describirError(derecha) : "—"}`;
    }
  }
  return null;
}

// Excepción aprobada: el resultado nuevo es el de la referencia "sin el texto enriquecido" más los
// errores `TEXTO_ENRIQUECIDO` esperados. Con encabezados enriquecidos, la referencia los leía como
// "[object Object]"; se compara contra la referencia de un formato donde eso no cambia nada: se
// afirma la lista nueva completa a partir de sus partes.
function verificarTextoEnriquecido(
  caso: CasoCorpus,
  formato: FormatoExcel,
  referencia: ResultadoValidacionReferencia,
  nuevo: ResultadoValidacionReferencia,
): void {
  const esperado = caso.textoEnriquecido;
  assert.ok(esperado);
  const enriquecidos = nuevo.errores.filter((error) => error.tipoError === "TEXTO_ENRIQUECIDO");
  const resto = nuevo.errores.filter((error) => error.tipoError !== "TEXTO_ENRIQUECIDO");

  // Ningún mensaje lleva contenido de celdas.
  for (const error of enriquecidos) {
    assert.ok(
      error.mensaje === MENSAJE_TEXTO_ENRIQUECIDO_CELDA || error.mensaje === MENSAJE_TEXTO_ENRIQUECIDO_ENCABEZADO,
      `mensaje inesperado: ${error.mensaje}`,
    );
  }

  const encabezadosEnFormato = new Set(formato.columnas.map((columna) => columna.nombre.trim().toLowerCase()));
  const encabezados = enriquecidos.filter((error) => error.numeroFila === 1).map((error) => error.columna);
  assert.deepEqual(encabezados, esperado.encabezados, `${formato.id}: encabezados enriquecidos`);

  if (esperado.encabezados.length === 0) {
    // Solo celdas: sin el error nuevo, la lista es idéntica a la referencia, y los errores nuevos
    // son exactamente las celdas enriquecidas en columnas que el formato valida (si se validan filas).
    const filasValidadas = !referencia.errores.some((error) => error.tipoError === "COLUMNA_INESPERADA");
    const celdasEsperadas = filasValidadas
      ? esperado.celdas.filter((celda) => encabezadosEnFormato.has(celda.columna.toLowerCase()) && formato.columnas.some((columna) => columna.nombre === celda.columna))
      : [];
    assert.deepEqual(
      enriquecidos.map((error) => `${error.numeroFila}|${error.columna}`),
      celdasEsperadas.map((celda) => `${celda.numeroFila}|${celda.columna}`),
      `${formato.id}: celdas enriquecidas`,
    );
    assert.equal(primeraDiferencia(referencia, { ...nuevo, errores: resto, cantidadErrores: nuevo.cantidadErrores - enriquecidos.length, estado: resto.length > 0 ? "CON_ERRORES" : "PENDIENTE_VISTO_BUENO" }), null);
    return;
  }

  // Encabezado enriquecido: se reconoce por su texto. La referencia lo leía "[object Object]"
  // (COLUMNA_INESPERADA + COLUMNA_FALTANTE); el resultado nuevo ya no los tiene por esa causa.
  assert.ok(referencia.errores.some((error) => error.columna === "[object Object]"));
  assert.ok(!nuevo.errores.some((error) => error.columna === "[object Object]"));
  assert.equal(nuevo.estado, "CON_ERRORES");
}

async function comparar(
  etiqueta: string,
  contenido: Buffer,
  formato: FormatoExcel,
  ventana: Ventana,
  caso?: CasoCorpus,
): Promise<void> {
  comparaciones += 1;
  let referencia: ResultadoValidacionReferencia | null = null;
  let errorReferencia: unknown = null;
  try {
    referencia = await validarEnMemoriaReferencia(contenido, formato, ventana, TOPE_FILAS_DATOS);
  } catch (error) {
    errorReferencia = error;
  }

  let nuevo: ResultadoValidacionReferencia | null = null;
  let errorNuevo: unknown = null;
  try {
    nuevo = await validarXlsxEnStreaming({ buffer: contenido }, formato, ventana);
  } catch (error) {
    errorNuevo = error;
  }

  // Lo que la lectura en memoria no podía leer (500 antes de RF-38) tampoco debe poder leerse ahora.
  if (errorReferencia || errorNuevo) {
    if (!errorReferencia || !errorNuevo) {
      diferencias += 1;
      console.error(`DIFERENCIA ${etiqueta}: referencia ${errorReferencia ? "lanza" : "lee"}, streaming ${errorNuevo ? "lanza" : "lee"}`);
      console.error(errorReferencia ?? errorNuevo);
    }
    return;
  }
  assert.ok(referencia && nuevo);

  if (caso?.textoEnriquecido) {
    try {
      verificarTextoEnriquecido(caso, formato, referencia, nuevo);
    } catch (error) {
      diferencias += 1;
      console.error(`DIFERENCIA ${etiqueta} (texto enriquecido):`, error);
    }
    return;
  }

  const diferencia = primeraDiferencia(referencia, nuevo);
  if (diferencia) {
    diferencias += 1;
    console.error(`DIFERENCIA ${etiqueta}: ${diferencia}`);
  }
}

function reviveFechas(_clave: string, valor: unknown): unknown {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(valor) ? new Date(valor) : valor;
}

async function compararCorpusExtra(directorio: string): Promise<number> {
  const archivos = (await readdir(directorio)).filter((nombre) => nombre.endsWith(".xlsx")).sort();
  for (const archivo of archivos) {
    const meta = JSON.parse(await readFile(path.join(directorio, archivo.replace(/\.xlsx$/, ".json")), "utf8"), reviveFechas) as {
      formato: FormatoExcel;
      ventana: Ventana;
    };
    const contenido = await readFile(path.join(directorio, archivo));
    await comparar(`extra/${archivo} × su formato`, contenido, meta.formato, meta.ventana);
    for (const formato of FORMATOS_PRUEBA) await comparar(`extra/${archivo} × ${formato.id}`, contenido, formato, VENTANA_PRUEBA);
  }
  return archivos.length;
}

async function main(): Promise<void> {
  const directorio = await mkdtemp(path.join(tmpdir(), "equivalencia-"));
  try {
    const inicio = performance.now();
    const casos = await generarCorpus(directorio);

    for (const caso of casos) {
      const contenido = await readFile(path.join(directorio, caso.archivo));
      for (const formato of FORMATOS_PRUEBA) {
        await comparar(`${caso.archivo} × ${formato.id}`, contenido, formato, VENTANA_PRUEBA, caso);
      }
      console.log(`  ok  ${caso.archivo}${caso.textoEnriquecido ? " (excepción: texto enriquecido)" : ""}`);
    }

    const directorioExtra = process.env.CORPUS_EXTRA_DIR;
    const extras = directorioExtra ? await compararCorpusExtra(directorioExtra) : 0;

    const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
    console.log(
      `\n${comparaciones} comparaciones (${casos.length} archivos sintéticos × ${FORMATOS_PRUEBA.length} formatos` +
        `${extras ? ` + ${extras} archivos reales` : ""}) en ${segundos} s: ${diferencias} diferencias`,
    );
    if (diferencias > 0) process.exitCode = 1;
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
}

void main();
