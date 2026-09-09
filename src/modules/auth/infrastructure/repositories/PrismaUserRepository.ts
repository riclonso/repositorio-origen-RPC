import { prisma } from "@/infrastructure/database/prisma";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { User } from "@/modules/auth/domain/entities/User";

export const prismaUserRepository: UserRepository = {
  async buscarPorRut(rut): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { rut } });

    if (!registro) {
      return null;
    }

    return {
      id: registro.id,
      nombres: registro.nombres,
      apellidos: registro.apellidos,
      rut: registro.rut,
      email: registro.email,
      username: registro.username,
      contrasenaHash: registro.contrasenaHash,
      rol: registro.rol,
      activo: registro.activo,
      createdAt: registro.createdAt,
    };
  },
};
