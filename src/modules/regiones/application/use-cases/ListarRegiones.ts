import type { Region } from "@/modules/regiones/domain/entities/Region";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";

// El listado llega ya ordenado por número desde el repositorio: es un catálogo chico sin
// búsqueda ni paginación.
export async function listarRegiones(dependencias: {
  repositorio: RegionRepository;
}): Promise<Region[]> {
  return dependencias.repositorio.listar();
}
