import type {
  CargaBioestadistica,
  FiltroListadoCargasBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";

export type ResultadoListadoCargasBioestadistica = {
  // Año efectivamente listado: el pedido o, sin uno, el más reciente con archivos (`null` si aún no
  // hay ninguno).
  anio: number | null;
  filas: CargaBioestadistica[];
  paginacion: { pagina: number; tamano: number; total: number; totalPaginas: number };
  // Años con archivos (para el selector), descendente.
  aniosConCargas: number[];
};

// RF-37: listado administrativo (ADMIN y REVISOR_REPOSITORIO) de los archivos de Bioestadística de un
// año, vigentes y reemplazados, paginado en el servidor. El usuario y el establecimiento vienen en la
// misma consulta (sin N+1).
export async function listarCargasBioestadisticaAdministracion(
  filtro: Omit<FiltroListadoCargasBioestadistica, "anio"> & { anio?: number },
  dependencias: { repositorio: CargaBioestadisticaRepository },
): Promise<ResultadoListadoCargasBioestadistica> {
  const aniosConCargas = await dependencias.repositorio.listarAniosConCargas();
  const anio = filtro.anio ?? aniosConCargas[0] ?? null;

  const pagina =
    anio === null
      ? { filas: [], total: 0 }
      : await dependencias.repositorio.listarParaAdministracion({ ...filtro, anio });

  return {
    anio,
    filas: pagina.filas,
    paginacion: {
      pagina: filtro.pagina,
      tamano: filtro.tamano,
      total: pagina.total,
      totalPaginas: Math.max(1, Math.ceil(pagina.total / filtro.tamano)),
    },
    aniosConCargas,
  };
}
