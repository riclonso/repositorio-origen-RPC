import type {
  EstablecimientoOpcion,
  FiltroOpcionesEstablecimiento,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";

// RF-30: opciones del select de establecimiento en el alta/edición de usuarios (solo activos, más
// el vigente de la persona en edición) y del filtro del listado de usuarios (todos).
export async function listarEstablecimientosParaSelect(
  filtro: FiltroOpcionesEstablecimiento,
  dependencias: { repositorio: EstablecimientoRepository },
): Promise<EstablecimientoOpcion[]> {
  return dependencias.repositorio.listarOpciones(filtro);
}
