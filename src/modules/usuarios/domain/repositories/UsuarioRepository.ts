import type { Usuario } from "@/modules/usuarios/domain/entities/Usuario";

export interface UsuarioRepository {
  crear(datos: Omit<Usuario, "id" | "createdAt">): Promise<Usuario>;
  obtenerPorId(id: string): Promise<Usuario | null>;
}
