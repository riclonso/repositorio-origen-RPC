import type { Establecimiento } from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";

export async function obtenerEstablecimiento(
  id: string,
  dependencias: { repositorio: EstablecimientoRepository },
): Promise<Establecimiento | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
