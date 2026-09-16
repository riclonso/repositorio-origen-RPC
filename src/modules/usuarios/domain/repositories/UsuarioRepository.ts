import type {
  CampoUnico,
  DatosEdicionUsuario,
  DatosNuevoUsuario,
  FiltroListadoUsuarios,
  PaginaUsuarios,
  Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";

export interface UsuarioRepository {
  listar(filtro: FiltroListadoUsuarios): Promise<PaginaUsuarios>;
  obtenerPorId(id: string): Promise<Usuario | null>;
  // Resuelve en UNA sola consulta cuál de los campos únicos ya está tomado.
  buscarConflicto(
    valores: { rut?: string; email?: string; username?: string },
    excluirId?: string,
  ): Promise<CampoUnico | null>;
  // Cuenta administradores activos por CÓDIGO de perfil, no por el nombre visible.
  contarAdminsActivos(): Promise<number>;
  crear(datos: DatosNuevoUsuario): Promise<Usuario>;
  actualizar(id: string, datos: DatosEdicionUsuario): Promise<Usuario>;
  cambiarEstado(id: string, activo: boolean): Promise<Usuario>;
  // Fija el hash de la contraseña de forma directa (fijado manual por el administrador). Debe
  // invalidar, en la misma transacción, los enlaces de contraseña vigentes de esa cuenta.
  actualizarContrasena(id: string, contrasenaHash: string): Promise<void>;
}
