// Construye la URL de paginación del detalle de una ventana, conservando solo la página (no hay
// más filtros en esta pantalla de solo lectura). Un parámetro en su valor por defecto se omite,
// mismo criterio que `construirRutaCargasDashboard`.
export function construirRutaDetalleVentanaDashboard(id: string, pagina: number): string {
  const base = `/dashboard/ventanas-carga/${id}`;
  return pagina <= 1 ? base : `${base}?page=${pagina}`;
}
