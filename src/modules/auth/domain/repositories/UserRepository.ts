import type { User } from "@/modules/auth/domain/entities/User";

export interface UserRepository {
  buscarPorRut(rut: string): Promise<User | null>;
  // La recuperación de contraseña resuelve la cuenta por correo y no por RUT: el RUT chileno
  // no es un secreto y su dígito verificador es calculable, así que un formulario público que
  // lo aceptara sería una máquina de bombardear casillas ajenas. `email` también es UNIQUE, de
  // modo que resuelve exactamente una fila.
  buscarPorEmail(email: string): Promise<User | null>;
}
