import type { FiltroListadoCargasPropias, PaginaCargas } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";

export type PaginacionCargas = {
  pagina: number;
  tamano: number;
  total: number;
  totalPaginas: number;
};

export type ResultadoListarCargas = {
  ok: true;
  filas: PaginaCargas["filas"];
  paginacion: PaginacionCargas;
};

// Pedir una página fuera de rango no es un error, mismo criterio que `listarUsuarios`: se
// devuelven filas vacías con el total real.
export async function listarCargasPropias(
  filtro: FiltroListadoCargasPropias,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoListarCargas> {
  const { filas, total } = await dependencias.repositorio.listarPropias(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
