import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";

export async function obtenerTipoEstablecimiento(
  id: string,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<TipoEstablecimiento | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
