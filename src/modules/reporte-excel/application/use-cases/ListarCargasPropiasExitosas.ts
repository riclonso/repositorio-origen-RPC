import {
  agruparCargasAprobadasPorVentana,
  type CargaArchivoResumenPropia,
  type GrupoCargaAprobada,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { PaginacionCargas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";

export type FiltroListarCargasPropiasExitosas = {
  usuarioId: string;
  pagina: number;
  tamano: number;
};

export type ResultadoListarCargasPropiasExitosas = {
  ok: true;
  grupos: GrupoCargaAprobada<CargaArchivoResumenPropia>[];
  paginacion: PaginacionCargas;
};

// "Mis cargas" (histórico de exitosas del notificador). Se pagina el arreglo de GRUPOS ya
// agrupados, nunca las filas crudas: así una reemplazada nunca queda separada de su vigente por un
// corte de página. Mismo contrato de paginación que `listarCargasPropias`/`listarCargasAprobadas`
// (pedir una página fuera de rango no es un error: se devuelven grupos vacíos con el total real).
export async function listarCargasPropiasExitosas(
  filtro: FiltroListarCargasPropiasExitosas,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoListarCargasPropiasExitosas> {
  const cargas = await dependencias.repositorio.listarPropiasAprobadas(filtro.usuarioId);
  const gruposTotales = agruparCargasAprobadasPorVentana(cargas);

  const total = gruposTotales.length;
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  const inicio = (filtro.pagina - 1) * filtro.tamano;
  const grupos = gruposTotales.slice(inicio, inicio + filtro.tamano);

  return {
    ok: true,
    grupos,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
