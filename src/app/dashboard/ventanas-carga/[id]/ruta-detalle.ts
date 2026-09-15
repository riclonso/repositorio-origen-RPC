// Construye la URL de paginación del detalle de una ventana, conservando la página y, si la
// persona entró desde la tarjeta del tablero de seguimiento del inicio (`?origen=inicio`), ese
// origen también — para que el enlace "volver" siga apuntando al inicio incluso después de
// cambiar de página. Un parámetro en su valor por defecto se omite, mismo criterio que
// `construirRutaCargasDashboard`.
export function construirRutaDetalleVentanaDashboard(id: string, pagina: number, origen?: string): string {
  const base = `/dashboard/ventanas-carga/${id}`;
  const parametros = new URLSearchParams();
  if (pagina > 1) parametros.set("page", String(pagina));
  if (origen) parametros.set("origen", origen);

  const query = parametros.toString();
  return query ? `${base}?${query}` : base;
}
