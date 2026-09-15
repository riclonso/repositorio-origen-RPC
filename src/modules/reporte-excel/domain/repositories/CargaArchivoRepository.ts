import type {
  CargaArchivo,
  CargaArchivoParaDescarga,
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
}
