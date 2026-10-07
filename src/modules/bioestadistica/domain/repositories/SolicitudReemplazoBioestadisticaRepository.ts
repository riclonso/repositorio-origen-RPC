import type {
  DatosNuevaSolicitudReemplazoBioestadistica,
  DatosRevisionSolicitudReemplazoBioestadistica,
  FiltroListadoSolicitudesBioestadistica,
  PaginaSolicitudesBioestadistica,
  SolicitudReemplazoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";

export interface SolicitudReemplazoBioestadisticaRepository {
  // Lanza `SolicitudReemplazoDuplicadaError` si el índice único parcial (PENDIENTE por carga)
  // rechaza el INSERT.
  crear(datos: DatosNuevaSolicitudReemplazoBioestadistica): Promise<SolicitudReemplazoBioestadistica>;
  obtenerPorId(id: string): Promise<SolicitudReemplazoBioestadistica | null>;
  obtenerPendientePorCarga(cargaId: string): Promise<SolicitudReemplazoBioestadistica | null>;
  // La APROBADA sin usar más reciente de una carga. La vigencia por fecha se evalúa en
  // `application/` con el resumen del año (`solicitudBioestadisticaUtilizable`).
  obtenerAprobadaSinUsarPorCarga(cargaId: string): Promise<SolicitudReemplazoBioestadistica | null>;
  listarPropias(usuarioId: string): Promise<SolicitudReemplazoBioestadistica[]>;
  listarParaRevision(filtro: FiltroListadoSolicitudesBioestadistica): Promise<PaginaSolicitudesBioestadistica>;
  // `UPDATE` condicional `WHERE estado = 'PENDIENTE'`: `null` si otra petición ya la resolvió.
  revisar(id: string, datos: DatosRevisionSolicitudReemplazoBioestadistica): Promise<SolicitudReemplazoBioestadistica | null>;
}
