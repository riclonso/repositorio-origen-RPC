import type { Region } from "@/modules/regiones/domain/entities/Region";
import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";

export async function obtenerRegion(
  id: string,
  dependencias: { repositorio: RegionRepository },
): Promise<Region | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
