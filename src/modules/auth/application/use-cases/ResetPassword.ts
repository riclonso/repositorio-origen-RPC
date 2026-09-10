import type { PasswordResetTokenRepository } from "@/modules/auth/domain/repositories/PasswordResetTokenRepository";
import type {
  GeneradorTokenRecuperacion,
  HasheadorContrasena,
} from "@/modules/auth/application/ports";

export type ResultadoRestablecerPorToken =
  | { ok: true; usuarioId: string; usuarioRut: string }
  | { ok: false; motivo: "TOKEN_INVALIDO" | "CUENTA_INACTIVA" };

export type DependenciasRestablecerPorToken = {
  repositorioTokens: PasswordResetTokenRepository;
  generadorToken: GeneradorTokenRecuperacion;
  hasheadorContrasena: HasheadorContrasena;
};

/**
 * Consume un enlace de recuperación y deja la contraseña nueva.
 *
 * La contraseña se hashea PRIMERO y SIEMPRE, antes de tocar la base: el coste queda uniforme
 * para un token válido y para uno inventado, y de paso el bcrypt actúa como freno natural
 * contra la fuerza bruta de tokens.
 *
 * El reclamo del token y la escritura de la contraseña ocurren en una sola transacción dentro
 * del repositorio, con una única sentencia condicional: "leer, validar y después marcar" sería
 * una condición de carrera que permitiría a dos peticiones simultáneas usar el mismo enlace.
 */
export async function resetPassword(
  token: string,
  contrasena: string,
  dependencias: DependenciasRestablecerPorToken,
): Promise<ResultadoRestablecerPorToken> {
  const contrasenaHash = await dependencias.hasheadorContrasena.hashear(contrasena);
  const tokenHash = dependencias.generadorToken.hashear(token);

  return dependencias.repositorioTokens.consumir(tokenHash, contrasenaHash);
}
