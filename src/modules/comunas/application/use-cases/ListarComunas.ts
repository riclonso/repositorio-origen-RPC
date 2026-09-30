import type { Comuna, FiltroListadoComunas } from "@/modules/comunas/domain/entities/Comuna";
import type { ComunaRepository } from "@/modules/comunas/domain/repositories/ComunaRepository";

// Catálogo chico sin búsqueda ni paginación: el listado llega ya ordenado (número de región, luego
// código de comuna) y opcionalmente filtrado por región y/o provincia desde el repositorio.
export async function listarComunas(
  filtro: FiltroListadoComunas,
  dependencias: { repositorio: ComunaRepository },
): Promise<Comuna[]> {
  return dependencias.repositorio.listar(filtro);
}
