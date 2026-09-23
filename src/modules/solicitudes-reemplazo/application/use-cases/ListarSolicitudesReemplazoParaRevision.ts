import type {
  FiltroListadoSolicitudesReemplazo,
  SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";

export type PaginacionSolicitudesReemplazo = {
  pagina: number;
  tamano: number;
  total: number;
  totalPaginas: number;
};

export type ResultadoListarSolicitudesReemplazoParaRevision = {
  filas: SolicitudReemplazoCarga[];
  paginacion: PaginacionSolicitudesReemplazo;
};

// Listado paginado para `/dashboard/solicitudes` y `/revisor/solicitudes`, mismo patrón que
// `listarCargasAprobadas`. El filtro por `estado` (por defecto `PENDIENTE` en el esquema Zod del
// Route Handler) lo aplica siempre el repositorio a nivel de consulta SQL.
export async function listarSolicitudesReemplazoParaRevision(
  filtro: FiltroListadoSolicitudesReemplazo,
  dependencias: { repositorio: SolicitudReemplazoCargaRepository },
): Promise<ResultadoListarSolicitudesReemplazoParaRevision> {
  const { filas, total } = await dependencias.repositorio.listarParaRevision(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    filas,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
