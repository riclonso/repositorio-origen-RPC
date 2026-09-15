import type { ErrorCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Etiquetas humanas de cada tipo de error de carga (RF-14), compartidas entre la tabla en
// pantalla (`ResumenErroresCarga.tsx`) y la generación del Excel de errores descargable
// (`GeneradorErroresExcelJs.ts`): un único lugar evita que ambas vistas del mismo dato diverjan.
export const ETIQUETAS_TIPO_ERROR: Record<ErrorCargaArchivo["tipoError"], string> = {
  COLUMNA_FALTANTE: "Columna faltante",
  COLUMNA_INESPERADA: "Columna inesperada",
  VALOR_REQUERIDO_VACIO: "Valor requerido vacío",
  TIPO_DATO_INVALIDO: "Tipo de dato inválido",
  REGLA_VALIDACION: "Regla de validación",
};

// Los errores estructurales (`COLUMNA_FALTANTE`/`COLUMNA_INESPERADA`) no son de una fila puntual
// y se representan con `numeroFila = 0`.
export function etiquetaFila(numeroFila: number): string {
  return numeroFila === 0 ? "Archivo completo" : String(numeroFila);
}
