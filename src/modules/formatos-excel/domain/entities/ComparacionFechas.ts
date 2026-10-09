import type { ConfiguracionComparacionFechas } from "./FormatoExcel";

export function columnasComparacionFechas(configuracion: ConfiguracionComparacionFechas): string[] {
  return [...new Set([configuracion.origen, configuracion.referencia].flatMap((fuente) => fuente.modo === "COLUMNA" ? [fuente.columna] : [fuente.dia, fuente.mes, fuente.anio]))];
}
