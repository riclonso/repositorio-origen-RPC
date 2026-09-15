// Construye la URL de paginación del detalle de una ventana, conservando solo la página (no hay
// más filtros en esta pantalla de solo lectura). Un parámetro en su valor por defecto se omite,
// mismo criterio que `construirRutaCargasRevisor`.
export function construirRutaDetalleVentanaRevisor(id: string, pagina: number): string {
  const base = `/revisor/ventanas-carga/${id}`;
  return pagina <= 1 ? base : `${base}?page=${pagina}`;
}
