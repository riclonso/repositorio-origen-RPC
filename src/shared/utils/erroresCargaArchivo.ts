import {
  NUMERO_FILA_ENCABEZADO,
  TIPOS_ERROR_DE_COLUMNA,
  type ErrorCargaArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Etiquetas humanas de cada tipo de error de carga (RF-14), compartidas entre la tabla en
// pantalla (`ResumenErroresCarga.tsx`) y la generación del Excel de errores descargable
// (`GeneradorErroresExcelJs.ts`): un único lugar evita que ambas vistas del mismo dato diverjan.
export const ETIQUETAS_TIPO_ERROR: Record<ErrorCargaArchivo["tipoError"], string> = {
  COLUMNA_FALTANTE: "Columna faltante",
  COLUMNA_INESPERADA: "Columna inesperada",
  VALOR_REQUERIDO_VACIO: "Valor requerido vacío",
  TIPO_DATO_INVALIDO: "Tipo de dato inválido",
  REGLA_VALIDACION: "Regla de validación",
  SIN_FILAS_DATOS: "Sin filas de datos",
};

// Los errores de nombres de columna van en la fila de encabezados. Los guardados antes de este
// criterio traen `numeroFila = 0` y se muestran igual con el número de esa fila. Del resto, los que
// no son de una fila puntual (`numeroFila = 0`):
// - `SIN_FILAS_DATOS`: "Archivo", porque el problema es del archivo completo, no de una columna.
// - Cualquier otro (p. ej. la fila resumen "... y N errores más" de `acotarErrores`): "—".
export function etiquetaFila(numeroFila: number, tipoError: ErrorCargaArchivo["tipoError"]): string {
  if (TIPOS_ERROR_DE_COLUMNA.has(tipoError) && numeroFila === 0) return String(NUMERO_FILA_ENCABEZADO);
  if (numeroFila !== 0) return String(numeroFila);
  if (tipoError === "SIN_FILAS_DATOS") return "Archivo";
  return "—";
}
