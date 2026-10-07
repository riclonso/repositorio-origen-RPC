import {
  agruparHistorialPorAnioYTipo,
  type GrupoHistorialBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import {
  indexarResumenesPorAnio,
  solicitudBioestadisticaUtilizable,
} from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type { SolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/SolicitudReemplazoBioestadisticaRepository";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

// Qué se puede hacer desde el historial con el archivo vigente de un grupo.
//  - SOLICITAR: no hay solicitud pendiente ni utilizable, y el año admite autorizaciones.
//  - SOLICITUD_PENDIENTE / REEMPLAZO_AUTORIZADO: hay una en curso (el reemplazo se sube en Inicio).
//  - NO_DISPONIBLE: sin vigente, o el año ya no tiene ninguna ventana publicada y no archivada.
export type AccionReemplazoHistorial =
  | { tipo: "SOLICITAR" }
  | { tipo: "SOLICITUD_PENDIENTE" }
  | { tipo: "REEMPLAZO_AUTORIZADO" }
  | { tipo: "NO_DISPONIBLE" };

export type GrupoHistorialConAccion = GrupoHistorialBioestadistica & { accionReemplazo: AccionReemplazoHistorial };

// RF-37: "Mis archivos" agrupados por (año, tipo), con la vigente y las reemplazadas anidadas, y qué
// admite la vigente respecto de un reemplazo. Tres consultas en total, sin N+1.
export async function listarHistorialBioestadistica(
  usuarioId: string,
  ahora: Date,
  dependencias: {
    repositorioCargas: CargaBioestadisticaRepository;
    repositorioSolicitudes: SolicitudReemplazoBioestadisticaRepository;
    repositorioVentanas: VentanaCargaRepository;
  },
): Promise<GrupoHistorialConAccion[]> {
  const [cargas, solicitudes] = await Promise.all([
    dependencias.repositorioCargas.listarHistorialPropio(usuarioId),
    dependencias.repositorioSolicitudes.listarPropias(usuarioId),
  ]);

  const grupos = agruparHistorialPorAnioYTipo(cargas);
  const resumenes = indexarResumenesPorAnio(
    await dependencias.repositorioVentanas.listarDiasVigenciaPorAnio(grupos.map((grupo) => grupo.anio)),
  );

  return grupos.map((grupo) => {
    const vigente = grupo.vigente;
    const resumenAnio = resumenes.get(grupo.anio) ?? null;

    if (!vigente || !resumenAnio) return { ...grupo, accionReemplazo: { tipo: "NO_DISPONIBLE" } };

    const deLaVigente = solicitudes.filter((solicitud) => solicitud.cargaBioestadisticaId === vigente.id);

    if (deLaVigente.some((solicitud) => solicitudBioestadisticaUtilizable(solicitud, resumenAnio, ahora))) {
      return { ...grupo, accionReemplazo: { tipo: "REEMPLAZO_AUTORIZADO" } };
    }

    if (deLaVigente.some((solicitud) => solicitud.estado === "PENDIENTE")) {
      return { ...grupo, accionReemplazo: { tipo: "SOLICITUD_PENDIENTE" } };
    }

    return { ...grupo, accionReemplazo: { tipo: "SOLICITAR" } };
  });
}
