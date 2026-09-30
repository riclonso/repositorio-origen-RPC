import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";

export type ResultadoValidacionProvincia =
  | { ok: true }
  | { ok: false; motivo: "PROVINCIA_INVALIDA" }
  | { ok: false; motivo: "CODIGO_NO_COINCIDE_PROVINCIA"; codigoProvincia: string };

// Reglas de negocio compartidas por el alta y la edición, en este orden: la provincia debe existir
// y el código de la comuna debe empezar con el código de esa provincia ("08101" → provincia
// "081"). Viven aquí y no en el esquema Zod porque dependen de datos de la base, y no en la UI
// porque se saltarían llamando a la API a mano. Mismo criterio que `validarRegionDeProvincia`.
export async function validarProvinciaDeComuna(
  provinciaId: string,
  codigoComuna: string,
  repositorioProvincias: ProvinciaRepository,
): Promise<ResultadoValidacionProvincia> {
  const provincia = await repositorioProvincias.obtenerPorId(provinciaId);

  if (!provincia) {
    return { ok: false, motivo: "PROVINCIA_INVALIDA" };
  }

  if (!codigoComuna.startsWith(provincia.codigo)) {
    return {
      ok: false,
      motivo: "CODIGO_NO_COINCIDE_PROVINCIA",
      codigoProvincia: provincia.codigo,
    };
  }

  return { ok: true };
}
