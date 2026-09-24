import type { User } from "@/modules/auth/domain/entities/User";

// Resultado atómico de registrar un intento fallido (ver `registrarIntentoFallido` abajo):
// refleja exactamente lo que la sentencia SQL condicional escribió, para que el caso de uso sepa
// si ESTE intento activó un bloqueo nuevo sin volver a leer la fila.
export type ResultadoIntentoFallido = {
  intentosFallidos: number;
  vecesBloqueada: number;
  bloqueadaHasta: Date | null;
};

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
  // Select angosto para `verificarSesion()`: NUNCA reutilizar `buscarPorId`, que trae
  // `contrasenaHash` y el resto de la fila solo para comparar un entero.
  obtenerVersionSesion(id: string): Promise<number | null>;
  // Único UPDATE atómico y condicional: incrementa `intentosFallidos` o, si este intento llega al
  // máximo, lo resetea a 0 Y activa un bloqueo nuevo (incrementa `vecesBloqueada`, fija
  // `bloqueadaHasta` según la tabla de duraciones progresivas). Ver la implementación en
  // `PrismaUserRepository` para el SQL exacto y por qué debe ser una sola sentencia.
  registrarIntentoFallido(
    id: string,
    ahora: Date,
    maximoIntentos: number,
    duracionesMinutos: readonly number[],
  ): Promise<ResultadoIntentoFallido>;
  // Login exitoso: limpia el ciclo de fallos actual. `vecesBloqueada` NO se toca (es monotónico de
  // por vida, ver comentario en `User.ts`).
  resetearIntentosFallidos(id: string): Promise<void>;
}
