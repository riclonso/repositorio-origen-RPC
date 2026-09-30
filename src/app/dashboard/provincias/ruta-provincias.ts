export const RUTA_PROVINCIAS = "/dashboard/provincias";

// El filtro por región vive en la URL (`?region=<id>`); sin región, la ruta base lista todas.
export function construirRutaProvincias(regionId?: string): string {
  return regionId ? `${RUTA_PROVINCIAS}?region=${encodeURIComponent(regionId)}` : RUTA_PROVINCIAS;
}
