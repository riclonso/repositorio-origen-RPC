export const RUTA_CARGAS_DASHBOARD = "/dashboard/cargas";

// Construye la URL del listado conservando solo la página (no hay más filtros en esta pantalla
// de solo lectura). Un parámetro en su valor por defecto se omite, mismo criterio que
// `construirRutaLogs`.
export function construirRutaCargasDashboard(pagina: number): string {
  if (pagina <= 1) return RUTA_CARGAS_DASHBOARD;
  return `${RUTA_CARGAS_DASHBOARD}?page=${pagina}`;
}
