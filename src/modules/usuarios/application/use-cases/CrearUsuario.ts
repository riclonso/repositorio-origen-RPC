import type { Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

// Pendiente: aún no existe un flujo de administración de usuarios en el sistema.
export async function crearUsuario(
  _datos: Omit<Usuario, "id" | "createdAt">,
  _dependencias: { repositorio: UsuarioRepository },
): Promise<Usuario> {
  throw new Error("crearUsuario: no implementado");
}
