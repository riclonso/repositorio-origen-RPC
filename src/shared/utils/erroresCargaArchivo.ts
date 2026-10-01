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
  SIN_FILAS_DATOS: "Sin filas de datos",
};

const TIPOS_ERROR_DE_COLUMNA: ReadonlySet<ErrorCargaArchivo["tipoError"]> = new Set([
  "COLUMNA_FALTANTE",
  "COLUMNA_INESPERADA",
]);

// Los errores que no son de una fila puntual se representan con `numeroFila = 0`, y su etiqueta
// depende del tipo:
// - Estructurales de columna (`COLUMNA_FALTANTE`/`COLUMNA_INESPERADA`): "Columna desconocida",
//   para que el mensaje describa mejor el problema que debe corregirse.
// - `SIN_FILAS_DATOS`: "Archivo", porque el problema es del archivo completo, no de una columna.
// - Cualquier otro con fila 0 (p. ej. la fila resumen "... y N errores más" de
//   `acotarErrores`): "—".
export function etiquetaFila(numeroFila: number, tipoError: ErrorCargaArchivo["tipoError"]): string {
  if (numeroFila !== 0) return String(numeroFila);
  if (TIPOS_ERROR_DE_COLUMNA.has(tipoError)) return "Columna desconocida";
  if (tipoError === "SIN_FILAS_DATOS") return "Archivo";
  return "—";
}
