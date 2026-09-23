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
  // Todos los usuarios activos de un perfil dado (por CÓDIGO), una sola consulta, sin N+1. Lo usa
  // el correo de confirmación de carga aprobada (buzón compartido del equipo revisor) cuando
  // `BUZON_COMPARTIDO_REVISOR_EMAIL` no está configurada: el correo va INDIVIDUAL a cada uno,
  // nunca todos en el mismo To/CC.
  listarActivosPorPerfil(perfilCodigo: string): Promise<Pick<Usuario, "id" | "nombres" | "email">[]>;
  crear(datos: DatosNuevoUsuario): Promise<Usuario>;
  actualizar(id: string, datos: DatosEdicionUsuario): Promise<Usuario>;
  cambiarEstado(id: string, activo: boolean): Promise<Usuario>;
  // Fija el hash de la contraseña de forma directa (fijado manual por el administrador). Debe
  // invalidar, en la misma transacción, los enlaces de contraseña vigentes de esa cuenta.
  actualizarContrasena(id: string, contrasenaHash: string): Promise<void>;
}
