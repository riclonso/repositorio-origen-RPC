import type { TipoEstablecimientoListado } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";

// RF-29: listado del mantenedor con el conteo de establecimientos por tipo, para que la UI
// deshabilite la eliminación de los tipos en uso. Llega ordenado por nombre desde el repositorio.
export async function listarTiposEstablecimientoConUso(dependencias: {
  repositorio: TipoEstablecimientoRepository;
}): Promise<TipoEstablecimientoListado[]> {
  return dependencias.repositorio.listarConUso();
}
