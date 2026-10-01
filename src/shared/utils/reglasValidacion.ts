import type { TipoReglaValidacion } from "@/modules/formatos-excel/domain/entities/FormatoExcel";

// Etiquetas visibles de cada tipo de regla de validación, compartidas entre el selector del editor
// (`EditorReglasValidacionFormatoExcel.tsx`) y los mensajes del esquema
// (`formato-excel.schema.ts`): un único lugar evita que el mensaje de error nombre la regla de
// forma distinta a como la ve quien la configura. Mismo criterio que `ETIQUETAS_TIPO_ERROR`.
export const ETIQUETAS_TIPO_REGLA_VALIDACION: Record<TipoReglaValidacion, string> = {
  ALGUNA_COLUMNA_CON_VALOR: "Al menos una columna con valor",
  FECHA_DENTRO_DE_VENTANA_VIGENTE: "Fecha dentro de la ventana de carga vigente",
  FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA:
    "Fecha efectiva (principal o alternativa más antigua) dentro del año de la ventana",
  FILA_DUPLICADA: "Fila duplicada",
  RUT_VALIDO: "Validar RUT",
  CONTENIDO_HTML: "Sin contenido HTML en las celdas",
  FILA_VACIA: "Sin filas vacías entre filas con datos",
};
