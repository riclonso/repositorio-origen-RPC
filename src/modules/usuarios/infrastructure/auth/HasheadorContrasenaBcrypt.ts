import { hashearContrasena } from "@/modules/auth/infrastructure/auth/PasswordService";
import type { HasheadorContrasena } from "@/modules/usuarios/application/ports";

// Reutiliza el hasheo de `modules/auth` (bcrypt, 12 rondas) en vez de duplicar la política
// de hasheo del proyecto.
export const hasheadorContrasenaBcrypt: HasheadorContrasena = {
  hashear: (contrasena) => hashearContrasena(contrasena),
};
