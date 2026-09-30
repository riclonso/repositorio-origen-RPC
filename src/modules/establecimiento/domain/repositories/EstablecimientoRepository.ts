import type {
  CampoUnico,
  DatosEdicionEstablecimiento,
  DatosNuevoEstablecimiento,
  Establecimiento,
  EstablecimientoOpcion,
  FiltroListadoEstablecimientos,
  FiltroOpcionesEstablecimiento,
  PaginaEstablecimientos,
} from "@/modules/establecimiento/domain/entities/Establecimiento";

export interface EstablecimientoRepository {
  // RF-30: opciones para selects, en UNA sola consulta (activos OR id IN incluirIds), ordenadas por
  // nombre con desempate por id.
  listarOpciones(filtro: FiltroOpcionesEstablecimiento): Promise<EstablecimientoOpcion[]>;
  // RF-30: si el establecimiento existe y está activo (asignable a un usuario).
  existeActivo(id: string): Promise<boolean>;
  listar(filtro: FiltroListadoEstablecimientos): Promise<PaginaEstablecimientos>;
  obtenerPorId(id: string): Promise<Establecimiento | null>;
  // Resuelve en UNA sola consulta si el RUT ya está tomado (excluyendo el propio registro en
  // edición). Devuelve el campo en conflicto o null.
  buscarConflicto(
    valores: { rut?: string },
    excluirId?: string,
  ): Promise<CampoUnico | null>;
  crear(datos: DatosNuevoEstablecimiento): Promise<Establecimiento>;
  actualizar(id: string, datos: DatosEdicionEstablecimiento): Promise<Establecimiento>;
  cambiarEstado(id: string, activo: boolean): Promise<Establecimiento>;
}
