export const RUTA_MIS_CARGAS = "/notificador/cargas";

// Construye la URL del listado conservando solo la página: el filtro por formato/año vive en el
// cliente (`TablaMisCargasExitosas`, sobre el arreglo ya cargado), no en la URL. Un parámetro en su
// valor por defecto se omite, mismo criterio que `construirRutaCargasDashboard`/`construirRutaLogs`.
export function construirRutaMisCargas(pagina: number): string {
  if (pagina <= 1) return RUTA_MIS_CARGAS;
  return `${RUTA_MIS_CARGAS}?page=${pagina}`;
}
