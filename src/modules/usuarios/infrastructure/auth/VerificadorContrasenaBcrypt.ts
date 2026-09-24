import { passwordService } from "@/modules/auth/infrastructure/auth/PasswordService";
import type { VerificadorContrasena } from "@/modules/usuarios/application/ports";

// Reutiliza la verificación de `modules/auth` (bcrypt) en vez de duplicar la política de hasheo
// del proyecto, mismo criterio que `hasheadorContrasenaBcrypt` reutiliza `hashearContrasena`.
export const verificadorContrasenaBcrypt: VerificadorContrasena = {
  verificar: (contrasena, hash) => passwordService.verificar(contrasena, hash),
};
