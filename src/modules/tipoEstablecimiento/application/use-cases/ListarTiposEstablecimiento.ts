import type {
  OpcionesListadoTipos,
  TipoEstablecimiento,
} from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";

// El listado llega ya ordenado por nombre desde el repositorio: es un catálogo chico sin
// búsqueda ni paginación.
export async function listarTiposEstablecimiento(
  opciones: OpcionesListadoTipos,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<TipoEstablecimiento[]> {
  return dependencias.repositorio.listar(opciones);
}
