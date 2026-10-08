import type ExcelJS from "exceljs";
import {
  recorrerFilasPrimeraHojaXlsx,
  type FuenteXlsx,
  type OpcionesLecturaXlsx,
} from "@/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";
import { celdaAValor } from "@/infrastructure/hojas-calculo/valorCelda";
import type { ValidadorArchivoReporte } from "@/modules/reporte-excel/application/ports";
import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { ResultadoValidacionArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  MAXIMO_COLUMNAS_ENCABEZADO,
  crearMotorValidacionFilas,
  type CeldaEncabezado,
} from "@/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import type { ContextoEvaluacionReglas } from "@/modules/reporte-excel/infrastructure/validacion/EvaluadorReglasValidacion";

// RF-38: tope de bytes DESCOMPRIMIDOS de la hoja de datos de una carga del notificador. Una hoja
// legítima de 500.000 filas × 50 columnas ocupa del orden de 0,8 a 1,5 GB de XML. Defiende frente a
// una bomba ZIP de filas vacías o celdas repetidas, que el tope de filas no frena.
export const TOPE_BYTES_HOJA_CARGA = 3 * 1024 * 1024 * 1024;

// Opciones del lector compartidas por la validación y la descarga generada: misma lectura que
// `xlsx.load` (celdas, combinadas, hipervínculos), solo las columnas que pueden ser encabezados.
export const OPCIONES_LECTURA_CARGA: OpcionesLecturaXlsx = {
  topeBytesHoja: TOPE_BYTES_HOJA_CARGA,
  aplicarCeldasCombinadas: true,
  celdasComoLecturaEnMemoria: true,
  maximoColumnas: MAXIMO_COLUMNAS_ENCABEZADO,
};

// RF-38: solo el `richText` de exceljs cuenta como texto enriquecido (fórmulas,
// hipervínculos e `inlineStr` simple conservan su comportamiento).
export function esTextoEnriquecido(crudo: ExcelJS.CellValue | undefined): boolean {
  return (
    typeof crudo === "object" &&
    crudo !== null &&
    !(crudo instanceof Date) &&
    "richText" in crudo &&
    Array.isArray(crudo.richText)
  );
}

// Texto de un encabezado como lo leía la validación en memoria (`String(valor).trim()`), salvo el
// texto enriquecido, que se lee por su texto (y se marca para rechazarlo).
export function celdaEncabezadoDesdeCrudo(crudo: ExcelJS.CellValue | undefined): CeldaEncabezado {
  if (crudo === null || crudo === undefined) return { texto: "", enriquecido: false };
  if (esTextoEnriquecido(crudo)) return { texto: String(celdaAValor(crudo) ?? "").trim(), enriquecido: true };
  return { texto: String(crudo).trim(), enriquecido: false };
}

export function celdasEncabezadoDesdeCrudos(crudos: readonly (ExcelJS.CellValue | undefined)[]): CeldaEncabezado[] {
  const celdas: CeldaEncabezado[] = [];
  for (let indice = 0; indice < crudos.length; indice += 1) celdas.push(celdaEncabezadoDesdeCrudo(crudos[indice]));
  return celdas;
}

// Valida un `.xlsx` en streaming. Expuesta aparte del adaptador para la prueba de equivalencia.
export async function validarXlsxEnStreaming(
  fuente: FuenteXlsx,
  formato: FormatoExcel,
  ventana: ContextoEvaluacionReglas["ventana"],
  opciones: { topeFilasDatos?: number } = {},
): Promise<ResultadoValidacionArchivo> {
  const motor = crearMotorValidacionFilas({ formato, ventana, topeFilasDatos: opciones.topeFilasDatos });
  let ultimaFila = 1;

  for await (const fila of recorrerFilasPrimeraHojaXlsx(fuente, OPCIONES_LECTURA_CARGA)) {
    ultimaFila = Math.max(ultimaFila, fila.numeroFila);
    const crudos = fila.crudos ?? [];

    if (fila.numeroFila === 1) {
      motor.procesarEncabezados(celdasEncabezadoDesdeCrudos(crudos));
      continue;
    }

    const enriquecidas: boolean[] = [];
    for (let indice = 0; indice < crudos.length; indice += 1) enriquecidas.push(esTextoEnriquecido(crudos[indice]));

    if (motor.procesarFila(fila.numeroFila, fila.valores, enriquecidas) === "DETENER") break;
  }

  return motor.finalizar(ultimaFila);
}

// Implementación del puerto `ValidadorArchivoReporte` sobre el almacén en disco: recibe cómo
// resolver una referencia a una ruta local, para no conocer el directorio base.
export function crearValidadorArchivoReporteStreaming(almacen: {
  rutaAbsoluta(referencia: string): string;
  fuenteXlsx?(referencia: string): Promise<import("unzipper").FuenteZip>;
}): ValidadorArchivoReporte {
  return {
    async validar(fuente, formato, ventana) {
      const origen = almacen.fuenteXlsx ? { fuenteZip: await almacen.fuenteXlsx(fuente.referencia) } : { ruta: almacen.rutaAbsoluta(fuente.referencia) };
      return validarXlsxEnStreaming(origen, formato, ventana);
    },
  };
}
