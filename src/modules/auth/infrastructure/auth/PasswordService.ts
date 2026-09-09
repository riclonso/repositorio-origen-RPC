import bcrypt from "bcrypt";
import type { VerificadorContrasena } from "@/modules/auth/application/ports";

const RONDAS_HASH = 12;

export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, RONDAS_HASH);
}

export const passwordService: VerificadorContrasena = {
  verificar: (contrasena, hash) => bcrypt.compare(contrasena, hash),
};
