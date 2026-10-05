import type {
  FiltroListadoCargasPendientesODecididas,
  PaginaCargasConPublicacion,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { PaginacionCargas } from "@/modules/reporte-excel/application/use-cases/ListarCargasPropias";

export type ResultadoListarCargasPendientesODecididas = {
  ok: true;
  // `enReemplazo`: APROBADA vigente con un reemplazo en curso (ver `listarIdsAprobadasEnReemplazo`).
  filas: (PaginaCargasConPublicacion["filas"][number] & { enReemplazo: boolean })[];
  paginacion: PaginacionCargas;
};

// El `WHERE` compuesto (`APROBADA` o `PENDIENTE_VISTO_BUENO` ya finalizada) lo aplica siempre el
// repositorio a nivel de consulta SQL, nunca aquí ni en la UI. Alimenta la tabla "Notificaciones de
// archivos pendientes de aprobación o rechazo" del detalle de ventana.
export async function listarCargasPendientesODecididas(
  filtro: FiltroListadoCargasPendientesODecididas,
  dependencias: { repositorio: CargaArchivoRepository },
  ahora: Date = new Date(),
): Promise<ResultadoListarCargasPendientesODecididas> {
  const [{ filas, total }, idsEnReemplazo] = await Promise.all([
    dependencias.repositorio.listarPendientesODecididas(filtro),
    dependencias.repositorio.listarIdsAprobadasEnReemplazo(filtro.ventanaCargaId, ahora),
  ]);
  const enReemplazo = new Set(idsEnReemplazo);
  const totalPaginas = Math.max(1, Math.ceil(total / filtro.tamano));

  return {
    ok: true,
    filas: filas.map((fila) => ({ ...fila, enReemplazo: enReemplazo.has(fila.id) })),
    paginacion: { pagina: filtro.pagina, tamano: filtro.tamano, total, totalPaginas },
  };
}
