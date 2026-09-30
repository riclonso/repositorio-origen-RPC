import type { Provincia } from "@/modules/provincias/domain/entities/Provincia";
import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";

export async function obtenerProvincia(
  id: string,
  dependencias: { repositorio: ProvinciaRepository },
): Promise<Provincia | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
