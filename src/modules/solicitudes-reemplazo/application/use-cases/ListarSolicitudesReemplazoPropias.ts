import type { SolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/domain/repositories/SolicitudReemplazoCargaRepository";
import type { SolicitudReemplazoCarga } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

export type ResultadoListarSolicitudesReemplazoPropias = {
  solicitudes: SolicitudReemplazoCarga[];
};

// "Mis solicitudes" del notificador (RF nuevo): ownership por `usuarioId`, filtrado en el `WHERE`
// del repositorio, no en esta capa. Sin paginar: mismo criterio de tope defensivo que
// `listarPropiasAprobadas` de `reporte-excel` (histórico acotado, no un listado sin límite).
export async function listarSolicitudesReemplazoPropias(
  usuarioId: string,
  dependencias: { repositorio: SolicitudReemplazoCargaRepository },
): Promise<ResultadoListarSolicitudesReemplazoPropias> {
  const solicitudes = await dependencias.repositorio.listarPropias(usuarioId);
  return { solicitudes };
}
