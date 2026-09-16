import type {
  Establecimiento,
  FiltroListadoEstablecimientos,
} from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";

export type PaginacionEstablecimientos = {
  pagina: number;
  tamano: number;
  total: number;
  totalPaginas: number;
};

export type ResultadoListarEstablecimientos = {
  ok: true;
  filas: Establecimiento[];
  paginacion: PaginacionEstablecimientos;
};

// Pedir una página fuera de rango no es un error: se devuelven filas vacías con el total real
// para que la interfaz pueda ofrecer volver a la página 1 conservando los filtros.
export async function listarEstablecimientos(
  filtro: FiltroListadoEstablecimientos,
  dependencias: { repositorio: EstablecimientoRepository },
): Promise<ResultadoListarEstablecimientos> {
  const { filas, total } = await dependencias.repositorio.listar(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: {
      pagina: filtro.pagina,
      tamano: filtro.tamano,
      total,
      totalPaginas,
    },
  };
}
