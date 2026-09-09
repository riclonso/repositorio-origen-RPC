import type { Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

export async function obtenerUsuario(
  id: string,
  dependencias: { repositorio: UsuarioRepository },
): Promise<Usuario | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
