import type {
  DatosNuevaSolicitudReemplazoCarga,
  DatosRevisionSolicitudReemplazoCarga,
  FiltroListadoSolicitudesReemplazo,
  PaginaSolicitudesReemplazo,
  SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";

export interface SolicitudReemplazoCargaRepository {
  // Lanza `SolicitudReemplazoDuplicadaError` si el índice único parcial rechaza el `INSERT`
  // (carrera con otra solicitud `PENDIENTE` de la misma carga).
  crear(datos: DatosNuevaSolicitudReemplazoCarga): Promise<SolicitudReemplazoCarga>;
  obtenerPorId(id: string): Promise<SolicitudReemplazoCarga | null>;
  // Ancla de "ya nació una nueva carga a partir de esta solicitud": lo usa `DarVistoBueno`
  // (extensión de RF-14) para saber si la carga a la que se le está dando visto bueno reemplaza a
  // otra, y con qué motivo, sin que `PrismaCargaArchivoRepository` necesite tocar esta tabla.
  obtenerPorNuevaCargaArchivoId(nuevaCargaArchivoId: string): Promise<SolicitudReemplazoCarga | null>;
  obtenerPendientePorCarga(cargaArchivoId: string): Promise<SolicitudReemplazoCarga | null>;
  // `ahora` viaja siempre como parámetro (nunca `now()` de PostgreSQL), mismo criterio que el resto
  // del esquema: filtra en el propio `WHERE` por `estado = APROBADA` y `utilizadaEn IS NULL`, y la
  // vigencia por fecha (`solicitudUtilizable`) se evalúa en la capa de aplicación sobre el registro
  // ya traído, para no duplicar esa regla en SQL.
  obtenerAprobadaUtilizablePorCarga(cargaArchivoId: string, ahora: Date): Promise<SolicitudReemplazoCarga | null>;
  listarPropias(usuarioId: string): Promise<SolicitudReemplazoCarga[]>;
  listarParaRevision(filtro: FiltroListadoSolicitudesReemplazo): Promise<PaginaSolicitudesReemplazo>;
  // Cuenta total de solicitudes `PENDIENTE` (ambos orígenes), usada para el chip del menú lateral
  // de ADMIN/REVISOR_REPOSITORIO. Consulta liviana aparte de `listarParaRevision` (sin traer filas).
  contarPendientes(): Promise<number>;
  // `UPDATE` condicional `WHERE estado = 'PENDIENTE'`: si ya fue resuelta por otra petición
  // concurrente, no actualiza ninguna fila y devuelve `null`. Mismo patrón que
  // `CargaArchivoRepository.darVistoBueno`.
  revisar(id: string, datos: DatosRevisionSolicitudReemplazoCarga): Promise<SolicitudReemplazoCarga | null>;
}
