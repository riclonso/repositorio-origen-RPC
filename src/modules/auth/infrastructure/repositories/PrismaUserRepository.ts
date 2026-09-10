import { prisma } from "@/infrastructure/database/prisma";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { User } from "@/modules/auth/domain/entities/User";

function aUser(registro: {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  contrasenaHash: string;
  perfilCodigo: string;
  activo: boolean;
  createdAt: Date;
}): User {
  return {
    id: registro.id,
    nombres: registro.nombres,
    apellidos: registro.apellidos,
    rut: registro.rut,
    email: registro.email,
    username: registro.username,
    contrasenaHash: registro.contrasenaHash,
    perfilCodigo: registro.perfilCodigo,
    activo: registro.activo,
    createdAt: registro.createdAt,
  };
}

export const prismaUserRepository: UserRepository = {
  async buscarPorRut(rut): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { rut } });
    return registro ? aUser(registro) : null;
  },

  // El email se persiste normalizado en minúsculas (ver `emailSchema`), así que quien llame
  // debe entregarlo ya normalizado: el UNIQUE de PostgreSQL distingue mayúsculas.
  async buscarPorEmail(email): Promise<User | null> {
    const registro = await prisma.usuario.findUnique({ where: { email } });
    return registro ? aUser(registro) : null;
  },
};
