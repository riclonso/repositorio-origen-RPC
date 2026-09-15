import type { FiltroListadoCargasAprobadas, PaginaCargas } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { PaginacionCargas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";

export type ResultadoListarCargasAprobadas = {
  ok: true;
  filas: PaginaCargas["filas"];
  paginacion: PaginacionCargas;
};

// El filtro `estado = APROBADA` lo aplica siempre el repositorio a nivel de consulta SQL, nunca
// aquí ni en la UI.
export async function listarCargasAprobadas(
  filtro: FiltroListadoCargasAprobadas,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoListarCargasAprobadas> {
  const { filas, total } = await dependencias.repositorio.listarAprobadas(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
