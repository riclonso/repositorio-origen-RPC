import type ExcelJS from "exceljs";

// Valor primitivo de una celda, ya libre de los objetos enriquecidos de exceljs. Coincide con
// `ValorCeldaArchivo` del módulo `reporte-excel` (RF-14) y lo usa también el lector en streaming de
// Bioestadística (RF-37).
export type ValorCeldaPrimitivo = string | number | boolean | Date | null;

// Traduce el valor "crudo" de una celda de exceljs a uno de los cuatro tipos primitivos. Los objetos
// enriquecidos (fórmulas, texto con formato, hipervínculos) se reducen a su valor calculado o su
// texto plano; nunca se propaga un objeto opaco. Extraída de `LectorArchivoReporteExcelJs` (RF-37)
// sin cambiar su comportamiento, para que ambos lectores conviertan las celdas exactamente igual.
export function celdaAValor(valor: ExcelJS.CellValue): ValorCeldaPrimitivo {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string") {
    return valor;
  }

  if (typeof valor === "object") {
    if ("result" in valor && valor.result !== undefined) {
      return celdaAValor(valor.result as ExcelJS.CellValue);
    }
    if ("text" in valor && typeof valor.text === "string") {
      return valor.text;
    }
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((fragmento) => fragmento.text).join("");
    }
  }

  return String(valor);
}
