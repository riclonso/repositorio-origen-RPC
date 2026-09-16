import type {
  DatosEdicionTipo,
  DatosNuevoTipo,
  OpcionesListadoTipos,
  TipoEstablecimiento,
} from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";

export interface TipoEstablecimientoRepository {
  listar(opciones?: OpcionesListadoTipos): Promise<TipoEstablecimiento[]>;
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
}
