import type { ConfiguracionComparacionFechas, FuenteFechaReferencia } from "./FormatoExcel";

export function columnasFuenteFecha(fuente: FuenteFechaReferencia): string[] {
  return fuente.modo === "COLUMNA" ? [fuente.columna] : fuente.modo === "COMPONENTES" ? [fuente.dia, fuente.mes, fuente.anio] : [];
}

export function columnasComparacionFechas(configuracion: ConfiguracionComparacionFechas): string[] {
  return [...new Set([configuracion.origen, configuracion.referencia].flatMap(columnasFuenteFecha))];
}

// "YYYY-MM-DD" -> día calendario UTC, o null si no es una fecha real.
export function diaCalendarioFechaFija(valor: string): number | null {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!coincidencia) return null;
  const [anio, mes, dia] = coincidencia.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return anio >= 100 && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? fecha.getTime() : null;
}
