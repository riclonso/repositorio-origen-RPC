import {
  MARCADOR_ANIO_DESDE,
  MARCADOR_ANIO_HASTA,
  MARCADOR_ANIO_VENTANA,
  type OperadorComparacionFechas,
  type TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";

// Etiquetas visibles de cada tipo de regla de validación, compartidas entre el selector del editor
// (`EditorReglasValidacionFormatoExcel.tsx`) y los mensajes del esquema
// (`formato-excel.schema.ts`): un único lugar evita que el mensaje de error nombre la regla de
// forma distinta a como la ve quien la configura. Mismo criterio que `ETIQUETAS_TIPO_ERROR`.
export const ETIQUETAS_TIPO_REGLA_VALIDACION: Record<TipoReglaValidacion, string> = {
  FECHA_POSTERIOR_O_IGUAL: "Comparación entre dos fechas",
  ALGUNA_COLUMNA_CON_VALOR: "Al menos una columna con valor",
  FILA_DUPLICADA: "Fila duplicada",
  RUT_VALIDO: "Validar RUT",
  CONTENIDO_HTML: "Sin contenido HTML en las celdas",
  FILA_VACIA: "Sin filas vacías entre filas con datos",
  FECHA_NO_FUTURA: "Fecha no futura (hasta el día de la notificación)",
  COMPARACION_ANIO_VENTANA: "Año de una fecha comparado con el año de la ventana",
  ANIO_DENTRO_DE_RANGO_VENTANA: "Año de fechas dentro de un rango en torno al año de la ventana",
};

// Opciones del selector de operador, compartidas por la comparación entre dos fechas
// (`EditorComparacionFechas`) y la comparación del año con el de la ventana.
export const OPCIONES_OPERADOR_COMPARACION: { valor: OperadorComparacionFechas; etiqueta: string }[] = [
  { valor: "MAYOR", etiqueta: "Mayor que (>)" },
  { valor: "MAYOR_IGUAL", etiqueta: "Mayor o igual que (≥)" },
  { valor: "IGUAL", etiqueta: "Igual a (=)" },
  { valor: "MENOR", etiqueta: "Menor que (<)" },
  { valor: "MENOR_IGUAL", etiqueta: "Menor o igual que (≤)" },
];

const TEXTO_OPERADOR_ANIO: Record<OperadorComparacionFechas, string> = {
  MAYOR: "mayor al",
  MAYOR_IGUAL: "mayor o igual al",
  IGUAL: "igual al",
  MENOR: "menor al",
  MENOR_IGUAL: "menor o igual al",
};

// Mensaje de rechazo sugerido para `COMPARACION_ANIO_VENTANA`. Incluye el marcador
// `{anioVentana}`, que el evaluador reemplaza por el año de la ventana; nunca el valor de la celda.
// El ajuste en años va como texto literal ("+ 1", "- 2"); con 0 se omite.
export function mensajeSugeridoAnioVentana(nombreColumna: string, operador: OperadorComparacionFechas, desplazamientoAnios = 0): string {
  const sujeto = nombreColumna ? `"${nombreColumna}"` : "la fecha";
  const ajuste = desplazamientoAnios === 0 ? "" : ` ${desplazamientoAnios > 0 ? "+" : "-"} ${Math.abs(desplazamientoAnios)}`;
  return `El año de ${sujeto}${ajuste} debe ser ${TEXTO_OPERADOR_ANIO[operador]} año de la ventana (${MARCADOR_ANIO_VENTANA})`;
}

// Mismo largo máximo que `MENSAJE_REGLA_MAXIMO` del esquema.
const LARGO_MAXIMO_MENSAJE_SUGERIDO = 300;
const MENSAJE_GENERICO_ANIO_RANGO = `El año de las fechas debe estar entre ${MARCADOR_ANIO_DESDE} y ${MARCADOR_ANIO_HASTA}`;

// Mensaje de rechazo sugerido para `ANIO_DENTRO_DE_RANGO_VENTANA`, con los marcadores de los límites
// del rango (los reemplaza el evaluador). Sin columnas, o si con sus nombres supera el largo máximo,
// se usa la versión genérica.
export function mensajeSugeridoAnioRango(columnas: string[]): string {
  if (columnas.length === 0) return MENSAJE_GENERICO_ANIO_RANGO;
  const sujeto = columnas.map((nombre) => `"${nombre}"`).join(", ");
  const sugerencia = `El año de ${sujeto} debe estar entre ${MARCADOR_ANIO_DESDE} y ${MARCADOR_ANIO_HASTA}`;
  return sugerencia.length <= LARGO_MAXIMO_MENSAJE_SUGERIDO ? sugerencia : MENSAJE_GENERICO_ANIO_RANGO;
}
