import type {
  FiltroListadoProvincias,
  Provincia,
} from "@/modules/provincias/domain/entities/Provincia";
import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";

// Catálogo chico sin búsqueda ni paginación: el listado llega ya ordenado (número de región,
// luego código) y opcionalmente filtrado por región desde el repositorio.
export async function listarProvincias(
  filtro: FiltroListadoProvincias,
  dependencias: { repositorio: ProvinciaRepository },
): Promise<Provincia[]> {
  return dependencias.repositorio.listar(filtro);
}
