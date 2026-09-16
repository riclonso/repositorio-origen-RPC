import bcrypt from "bcrypt";
import type {
  HasheadorContrasena,
  VerificadorContrasena,
} from "@/modules/auth/application/ports";

const RONDAS_HASH = 12;

export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, RONDAS_HASH);
}

export const passwordService: VerificadorContrasena = {
  verificar: (contrasena, hash) => bcrypt.compare(contrasena, hash),
};

// Envuelve la política de hasheo del proyecto tras un puerto, para que ningún caso de uso
// importe bcrypt. Toda escritura de contraseñas vive ahora en `modules/auth/`.
export const hasheadorContrasena: HasheadorContrasena = {
  hashear: (contrasena) => hashearContrasena(contrasena),
};
