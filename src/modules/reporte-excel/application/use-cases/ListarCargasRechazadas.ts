import type { FiltroListadoCargasRechazadas, PaginaCargas } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { PaginacionCargas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";

export type ResultadoListarCargasRechazadas = {
  ok: true;
  filas: PaginaCargas["filas"];
  paginacion: PaginacionCargas;
};

// El filtro `estado = RECHAZADA` lo aplica siempre el repositorio a nivel de consulta SQL, nunca
// aquí ni en la UI, mismo criterio que `listarCargasAprobadas`.
export async function listarCargasRechazadas(
  filtro: FiltroListadoCargasRechazadas,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoListarCargasRechazadas> {
  const { filas, total } = await dependencias.repositorio.listarRechazadas(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
