import type {
  FiltroListadoCargasPendientesODecididas,
  PaginaCargas,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { PaginacionCargas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";

export type ResultadoListarCargasPendientesODecididas = {
  ok: true;
  filas: PaginaCargas["filas"];
  paginacion: PaginacionCargas;
};

// El `WHERE` compuesto (`APROBADA` o `PENDIENTE_VISTO_BUENO` ya finalizada) lo aplica siempre el
// repositorio a nivel de consulta SQL, nunca aquí ni en la UI. Alimenta la tabla "Notificaciones de
// archivos pendientes de aprobación o rechazo" del detalle de ventana.
export async function listarCargasPendientesODecididas(
  filtro: FiltroListadoCargasPendientesODecididas,
  dependencias: { repositorio: CargaArchivoRepository },
): Promise<ResultadoListarCargasPendientesODecididas> {
  const { filas, total } = await dependencias.repositorio.listarPendientesODecididas(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas,
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
