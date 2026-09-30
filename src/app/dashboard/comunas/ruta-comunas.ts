export const RUTA_COMUNAS = "/dashboard/comunas";

export type FiltroRutaComunas = {
  regionId?: string;
  provinciaId?: string;
};

// Los filtros viven en la URL (`?region=<id>&provincia=<id>`), independientes entre sí; sin
// ninguno, la ruta base lista todas.
export function construirRutaComunas(filtro: FiltroRutaComunas = {}): string {
  const parametros = new URLSearchParams();

  if (filtro.regionId) parametros.set("region", filtro.regionId);
  if (filtro.provinciaId) parametros.set("provincia", filtro.provinciaId);

  const consulta = parametros.toString();
  return consulta ? `${RUTA_COMUNAS}?${consulta}` : RUTA_COMUNAS;
}
