import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

// Pendiente: implementar contra Prisma cuando se construya la administración de usuarios.
export const prismaUsuarioRepository: UsuarioRepository = {
  crear() {
    throw new Error("PrismaUsuarioRepository.crear: no implementado");
  },
  obtenerPorId() {
    throw new Error("PrismaUsuarioRepository.obtenerPorId: no implementado");
  },
};
