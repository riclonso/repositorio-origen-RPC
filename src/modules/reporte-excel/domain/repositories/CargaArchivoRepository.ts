import type {
  CargaArchivo,
  CargaArchivoParaDescarga,
  CargaArchivoResumen,
  DatosNuevaCargaArchivo,
  FiltroListadoCargasAprobadas,
  FiltroListadoCargasPropias,
  PaginaCargas,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";

export interface CargaArchivoRepository {
  // Transaccional: crea la carga y sus errores en una sola operación atómica (nested write, mismo
  // patrón que `FormatoExcelRepository.crear`).
  crear(datos: DatosNuevaCargaArchivo): Promise<CargaArchivo>;
  obtenerPorId(id: string): Promise<CargaArchivo | null>;
  // Filtra `usuarioId` a nivel de consulta SQL, nunca solo en la UI: una carga que no pertenece
  // al actor debe comportarse como si no existiera desde el propio `WHERE`, no por descarte en JS.
  obtenerPropiaPorId(id: string, usuarioId: string): Promise<CargaArchivo | null>;
  // Filtra `estado = APROBADA` a nivel de consulta SQL, mismo criterio que `listarAprobadas`.
  obtenerAprobadaPorId(id: string): Promise<CargaArchivo | null>;
  listarPropias(filtro: FiltroListadoCargasPropias): Promise<PaginaCargas>;
  // "Mis cargas" (histórico de exitosas): TODAS las `APROBADA` de un notificador, ordenadas
  // `vistoBuenoEn desc` (contrato del que depende `agruparCargasAprobadasPorVentana` en
  // `domain/entities/CargaArchivo.ts` para detectar la vigente como la primera ocurrencia de cada
  // `ventanaCargaId`). Sin paginar en SQL: la agrupación y la paginación de los GRUPOS resultantes
  // ocurren en `application/`, nunca sobre las filas crudas, para que una reemplazada no quede
  // separada de su vigente por un corte de página. Ownership por `usuarioId` siempre en el `WHERE`.
  listarPropiasAprobadas(usuarioId: string): Promise<CargaArchivoResumen[]>;
  // Filtra siempre `estado = APROBADA` a nivel de consulta SQL, nunca solo en la UI.
  listarAprobadas(filtro: FiltroListadoCargasAprobadas): Promise<PaginaCargas>;
  // Transición condicional y atómica `PENDIENTE_VISTO_BUENO -> APROBADA`, filtrada por
  // `usuarioId` en el mismo `WHERE`: si la carga no es de ese usuario, no está en ese estado, o
  // ya se le dio visto bueno en otra petición concurrente, no actualiza ninguna fila y devuelve
  // `null`. Las reglas de negocio (qué mensaje mostrar por cada motivo de rechazo) viven en
  // `application/`, que decide el mensaje comparando contra el estado ya conocido.
  darVistoBueno(id: string, usuarioId: string): Promise<CargaArchivo | null>;
  // Única operación que trae el binario. Solo devuelve datos si `estado = APROBADA`.
  obtenerParaDescarga(id: string): Promise<CargaArchivoParaDescarga | null>;
  // RF-16 (tablero de seguimiento): cuántos usuarios DISTINTOS tienen al menos una carga APROBADA
  // en cada ventana ("ya reportaron"). `CargaArchivo` no tiene restricción de unicidad sobre
  // `(usuarioId, ventanaCargaId)` — un notificador puede tener varias cargas APROBADA en la misma
  // ventana (correcciones sucesivas) — así que la implementación debe deduplicar por usuario,
  // nunca contar filas. Devuelve un mapa `ventanaCargaId -> cantidad`; los ids sin ningún
  // notificador que haya reportado no aparecen como clave.
  contarNotificadoresDistintosPorVentana(ventanaCargaIds: string[]): Promise<Record<string, number>>;
}
