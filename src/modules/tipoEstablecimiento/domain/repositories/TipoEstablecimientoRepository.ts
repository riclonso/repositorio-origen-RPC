import type {
  DatosEdicionTipo,
  DatosNuevoTipo,
  OpcionesListadoTipos,
  TipoEstablecimiento,
  TipoEstablecimientoListado,
} from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";

export interface TipoEstablecimientoRepository {
  listar(opciones?: OpcionesListadoTipos): Promise<TipoEstablecimiento[]>;
  // RF-29: listado completo del mantenedor (activos e inactivos) con el conteo de establecimientos
  // que usan cada tipo, resuelto en la misma consulta (sin N+1).
  listarConUso(): Promise<TipoEstablecimientoListado[]>;
  // Existe y está activo: lo usan crear/editar establecimiento para validar la asignabilidad del
  // tipo antes de escribir.
  existeActivo(id: string): Promise<boolean>;
  obtenerPorId(id: string): Promise<TipoEstablecimiento | null>;
  // Resuelve en UNA sola consulta si el nombre normalizado ya está tomado (excluyendo el propio
  // registro en edición).
  buscarConflictoNombre(nombreNormalizado: string, excluirId?: string): Promise<boolean>;
  crear(datos: DatosNuevoTipo): Promise<TipoEstablecimiento>;
  actualizar(id: string, datos: DatosEdicionTipo): Promise<TipoEstablecimiento>;
  cambiarEstado(id: string, activo: boolean): Promise<TipoEstablecimiento>;
  // RF-29: eliminación física. Devuelve false si el tipo ya no existe (P2025). Lanza
  // `TipoEstablecimientoEnUsoError` si algún establecimiento lo referencia (P2003).
  eliminar(id: string): Promise<boolean>;
}
