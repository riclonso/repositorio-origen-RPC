import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";

export type ResultadoValidacionRegion =
  | { ok: true }
  | { ok: false; motivo: "REGION_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_REGION"; codigoRegion: string };

// Reglas de negocio compartidas por el alta y la edición, en este orden: la región debe existir y
// el código de la provincia debe empezar con el código de esa región ("081" → región "08").
// Viven aquí y no en el esquema Zod porque dependen de datos de la base, y no en la UI porque se
// saltarían llamando a la API a mano.
export async function validarRegionDeProvincia(
  regionId: string,
  codigoProvincia: string,
  repositorioRegiones: RegionRepository,
): Promise<ResultadoValidacionRegion> {
  const region = await repositorioRegiones.obtenerPorId(regionId);

  if (!region) {
    return { ok: false, motivo: "REGION_INVALIDA" };
  }

  if (!codigoProvincia.startsWith(region.codigo)) {
    return { ok: false, motivo: "CODIGO_NO_COINCIDE_REGION", codigoRegion: region.codigo };
  }

  return { ok: true };
}
