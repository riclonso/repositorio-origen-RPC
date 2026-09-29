import type {
  CampoUnico,
  CredencialUsuario,
  DatosEdicionUsuario,
  DatosNuevoUsuario,
  FiltroListadoUsuarios,
  PaginaUsuarios,
  Usuario,
} from "@/modules/usuarios/domain/entities/Usuario";

// Desenlace de la eliminación física (RF-25). En `ELIMINADO` se devuelven los datos del objetivo
// que la auditoría necesita, porque cuando el handler audita la fila ya no existe. En
// `CON_HISTORIAL`, solo los NOMBRES de las relaciones que bloquean (para auditoría interna; la
// respuesta HTTP no los enumera).
export type ResultadoEliminacionUsuario =
  | { estado: "ELIMINADO"; rut: string; perfilCodigo: string; formatosQuitadosIds: string[] }
  | { estado: "NO_ENCONTRADO" }
  | { estado: "ULTIMO_ADMIN"; rut: string }
  // Revalidación dentro de la transacción: la cuenta pasó a ser ADMIN después de la lectura previa
  // del caso de uso y el actor no es ADMIN.
  | { estado: "PERFIL_ADMIN_RESTRINGIDO"; rut: string }
  | { estado: "CON_HISTORIAL"; rut: string; relacionesBloqueantes: string[] };

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
  // Fija el hash de la contraseña de forma directa (fijado manual por el administrador, o
  // autoservicio propio). Debe invalidar, en la misma transacción, los enlaces de contraseña
  // vigentes de esa cuenta, e incrementar `sesionVersion` para cerrar cualquier sesión abierta
  // con la contraseña anterior.
  actualizarContrasena(id: string, contrasenaHash: string): Promise<void>;
  // Select angosto que SÍ expone el hash: único punto de `modules/usuarios/` que lo hace, y solo
  // lo usa `cambiarContrasenaPropia` para verificar la contraseña actual antes de reemplazarla.
  // NUNCA reutilizar `SELECCION_USUARIO` (no trae el hash) ni exponer este método fuera de ese
  // caso de uso.
  obtenerCredencialPorId(id: string): Promise<CredencialUsuario | null>;
  // Desbloqueo MANUAL desde el mantenedor: limpia `intentosFallidos`/`bloqueadaHasta`.
  // `vecesBloqueada` NO se toca (decisión deliberada, ver `DesbloquearUsuario.ts`): es monotónico
  // de por vida y determina la duración del PRÓXIMO bloqueo, con o sin desbloqueos manuales de por
  // medio.
  desbloquear(id: string): Promise<void>;
  // Eliminación FÍSICA de una cuenta sin historial (RF-25). ATÓMICA: la regla del último ADMIN
  // activo, la comprobación de historial y el DELETE ocurren en una sola transacción con la fila
  // bloqueada, para que ninguna escritura concurrente se cuele entre la comprobación y el borrado.
  // Los tokens de recuperación y las asignaciones de formatos se descartan en cascada. Lanza
  // `ConflictoConcurrenteError` si la transacción se aborta por una escritura concurrente.
  // `actorEsAdmin` permite revalidar PERFIL_ADMIN_RESTRINGIDO sobre la fila BLOQUEADA: si la cuenta
  // fue ascendida a ADMIN tras la lectura previa del caso de uso, un actor no ADMIN no la borra.
  eliminar(id: string, actorEsAdmin: boolean): Promise<ResultadoEliminacionUsuario>;
}
