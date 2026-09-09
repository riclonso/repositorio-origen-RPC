import type { Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

// Pendiente: aún no existe un flujo de administración de usuarios en el sistema.
export async function obtenerUsuario(
  _id: string,
  _dependencias: { repositorio: UsuarioRepository },
): Promise<Usuario | null> {
  throw new Error("obtenerUsuario: no implementado");
}
