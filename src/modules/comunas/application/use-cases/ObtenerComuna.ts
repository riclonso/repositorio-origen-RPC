import type { Comuna } from "@/modules/comunas/domain/entities/Comuna";
import type { ComunaRepository } from "@/modules/comunas/domain/repositories/ComunaRepository";

export async function obtenerComuna(
  id: string,
  dependencias: { repositorio: ComunaRepository },
): Promise<Comuna | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
