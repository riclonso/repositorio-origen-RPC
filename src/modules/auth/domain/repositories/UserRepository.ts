import type { User } from "@/modules/auth/domain/entities/User";

export interface UserRepository {
  buscarPorRut(rut: string): Promise<User | null>;
  // Resuelve la cuenta por su id (el `sub` del JWT). Lo usa el panel del notificador para saludar
  // con el nombre de quien tiene la sesión vigente, sin volver a pedir el RUT.
  buscarPorId(id: string): Promise<User | null>;
  // La recuperación de contraseña resuelve la cuenta por correo y no por RUT: el RUT chileno
  // no es un secreto y su dígito verificador es calculable, así que un formulario público que
  // lo aceptara sería una máquina de bombardear casillas ajenas. `email` también es UNIQUE, de
  // modo que resuelve exactamente una fila.
  buscarPorEmail(email: string): Promise<User | null>;
}
