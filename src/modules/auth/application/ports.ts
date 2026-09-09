import type { User } from "@/modules/auth/domain/entities/User";

export interface VerificadorContrasena {
  verificar(contrasena: string, hash: string): Promise<boolean>;
}

export interface EmisorSesion {
  emitir(usuario: Pick<User, "id" | "rol">): Promise<string>;
}
