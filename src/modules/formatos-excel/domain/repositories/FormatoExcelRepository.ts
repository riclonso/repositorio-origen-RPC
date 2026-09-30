import type {
  DatosEdicionFormatoExcel,
  DatosNuevoFormatoExcel,
  FormatoExcel,
  FormatoExcelResumen,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type {
  CandidatoAsignacionFormato,
  ResultadoAsignacionMasivaRepositorio,
  ResultadoDesactivacionFormato,
  ResultadoEliminacionFormato,
} from "@/modules/formatos-excel/domain/entities/AsignacionFormato";

export interface FormatoExcelRepository {
  listar(): Promise<FormatoExcelResumen[]>;
  // RF-14: si el usuario no tiene ese formato asignado y activo (asignación vigente y
  // `FormatoExcel.activo = true`), no puede subir un archivo contra él. Una sola consulta,
  // nunca dos llamadas separadas (asignación + estado) que dejen ventana de carrera.
  estaAsignadoYActivo(usuarioId: string, formatoExcelId: string): Promise<boolean>;
  // Formatos activos asignados a un usuario, para el selector de subida (RF-14). Vista liviana:
  // no trae columnas ni reglas, solo lo necesario para poblar un `<select>`.
  listarAsignadosAUsuario(usuarioId: string): Promise<FormatoExcelResumen[]>;
  obtenerPorId(id: string): Promise<FormatoExcel | null>;
  existeActivo(id: string): Promise<boolean>;
  // Resuelve en UNA sola consulta (`WHERE id IN (...) AND activo = true`) cuáles de los ids
  // recibidos corresponden a un formato existente y vigente. Evita el N+1 de comprobar cada id
  // por separado al validar el arreglo de formatos asignados a un usuario.
  obtenerActivosEntre(ids: string[]): Promise<string[]>;
  // Transaccional: crea el formato, sus columnas y sus reglas de validación en una sola
  // operación atómica.
  crear(datos: DatosNuevoFormatoExcel): Promise<FormatoExcel>;
  // Transaccional: reemplaza el set completo de columnas y de reglas de validación (borra las
  // anteriores, inserta las nuevas) en la misma operación que actualiza `nombre`/`descripcion`.
  actualizar(id: string, datos: DatosEdicionFormatoExcel): Promise<FormatoExcel>;
  cambiarEstado(id: string, activo: boolean): Promise<FormatoExcel>;
  // Transaccional (`Serializable`): desactiva el formato y borra TODAS sus filas de
  // `usuario_formato_excel` en la misma operación. Si el formato ya estaba inactivo no toca nada
  // (`SIN_CAMBIO`, no limpia asignaciones heredadas). Si es el único formato de algún
  // NOTIFICADOR_RPC (activo o inactivo), devuelve `BLOQUEADO` sin escribir. Lanza
  // `ConflictoConcurrenteError` si la transacción se aborta por una escritura concurrente.
  desactivarQuitandoAsignaciones(id: string): Promise<ResultadoDesactivacionFormato>;
  // Transaccional (`Serializable`). Bloquea con `BLOQUEADO` si el formato es el único de algún
  // NOTIFICADOR_RPC (mismo criterio que la desactivación). Lanza `ConflictoConcurrenteError`.
  eliminar(id: string): Promise<ResultadoEliminacionFormato>;
  // NOTIFICADOR_RPC activos con su relación a este formato, para el modal de asignación masiva.
  // Una sola consulta de usuarios (sin N+1). `null` si el formato no existe.
  listarCandidatosAsignacion(id: string): Promise<CandidatoAsignacionFormato[] | null>;
  // Transaccional (`Serializable`): re-comprueba que el formato siga activo, lee el estado de los
  // usuarios del lote en una consulta, los clasifica con `clasificarCambiosAsignacion` y aplica
  // solo lo aplicable (`createMany` + `deleteMany`). Lanza `ConflictoConcurrenteError`.
  aplicarAsignacionesMasivas(
    id: string,
    agregarIds: string[],
    quitarIds: string[],
  ): Promise<ResultadoAsignacionMasivaRepositorio>;
  buscarPorNombre(nombre: string): Promise<FormatoExcel | null>;
  // RF-16 (tablero de seguimiento): cuántos usuarios NOTIFICADOR_RPC ACTIVOS tienen cada formato
  // asignado ("deben reportar"). Cuenta ESTRUCTURAL: no filtra por `FormatoExcel.activo` — si el
  // formato de una ventana ya vigente fue dado de baja después de crearla, los notificadores
  // asignados originalmente se siguen contando. Devuelve un mapa `formatoExcelId -> cantidad`; los
  // ids sin ningún notificador asignado simplemente no aparecen como clave (el llamador debe
  // hacer fallback a 0). Una sola consulta agrupada, nunca una por formato.
  contarNotificadoresAsignadosActivosPorFormato(formatoExcelIds: string[]): Promise<Record<string, number>>;
}
