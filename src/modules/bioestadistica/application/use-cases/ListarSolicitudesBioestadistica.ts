import {
  indexarResumenesPorAnio,
  type FiltroListadoSolicitudesBioestadistica,
  type SolicitudReemplazoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type { ResumenVigenciaAnio } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

// Las solicitudes vienen con el resumen de vigencia de cada año (una sola consulta agrupada) para que
// la vista calcule "vencida" y "vence el" sin consultar por fila.
export type SolicitudesConVigencia = {
  solicitudes: SolicitudReemplazoBioestadistica[];
  resumenesPorAnio: Map<number, ResumenVigenciaAnio>;
};

async function conResumenes(
  solicitudes: SolicitudReemplazoBioestadistica[],
  repositorioVentanas: VentanaCargaRepository,
): Promise<Map<number, ResumenVigenciaAnio>> {
  return indexarResumenesPorAnio(
    await repositorioVentanas.listarDiasVigenciaPorAnio(solicitudes.map((solicitud) => solicitud.anio)),
  );
}

// RF-37: "Mis solicitudes" del área Bioestadística (solo lectura).
export async function listarSolicitudesBioestadisticaPropias(
  usuarioId: string,
  dependencias: { repositorio: SolicitudReemplazoBioestadisticaRepository; repositorioVentanas: VentanaCargaRepository },
): Promise<SolicitudesConVigencia> {
  const solicitudes = await dependencias.repositorio.listarPropias(usuarioId);
  return { solicitudes, resumenesPorAnio: await conResumenes(solicitudes, dependencias.repositorioVentanas) };
}

export type PaginaSolicitudesConVigencia = SolicitudesConVigencia & {
  paginacion: { pagina: number; tamano: number; total: number; totalPaginas: number };
};

// RF-37: bandeja de revisión (ADMIN y REVISOR_REPOSITORIO), paginada y filtrada por estado.
export async function listarSolicitudesBioestadisticaParaRevision(
  filtro: FiltroListadoSolicitudesBioestadistica,
  dependencias: { repositorio: SolicitudReemplazoBioestadisticaRepository; repositorioVentanas: VentanaCargaRepository },
): Promise<PaginaSolicitudesConVigencia> {
  const pagina = await dependencias.repositorio.listarParaRevision(filtro);

  return {
    solicitudes: pagina.filas,
    resumenesPorAnio: await conResumenes(pagina.filas, dependencias.repositorioVentanas),
    paginacion: {
      pagina: filtro.pagina,
      tamano: filtro.tamano,
      total: pagina.total,
      totalPaginas: Math.max(1, Math.ceil(pagina.total / filtro.tamano)),
    },
  };
}
