import type { User } from "@/modules/auth/domain/entities/User";

export interface UserRepository {
  buscarPorRut(rut: string): Promise<User | null>;
}
