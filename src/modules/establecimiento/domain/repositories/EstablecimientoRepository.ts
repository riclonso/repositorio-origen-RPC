import type {
  CampoUnico,
  DatosEdicionEstablecimiento,
  DatosNuevoEstablecimiento,
  Establecimiento,
  FiltroListadoEstablecimientos,
  PaginaEstablecimientos,
} from "@/modules/establecimiento/domain/entities/Establecimiento";

export interface EstablecimientoRepository {
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
