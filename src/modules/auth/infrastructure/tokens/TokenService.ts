import { createHash, randomBytes } from "node:crypto";
import { BYTES_TOKEN_RECUPERACION } from "@/modules/auth/domain/entities/PasswordResetToken";
import type { GeneradorTokenRecuperacion } from "@/modules/auth/application/ports";

// El tamaño en bytes y el largo resultante viven en `domain/`, porque el esquema Zod deriva de
// ellos y lo importan Client Components. Nunca `Math.random()`, y nunca `randomUUID()`: un
// UUIDv4 aporta 122 bits y su estructura es reconocible.

// SHA-256 y no bcrypt, por tres razones:
//  1. El token es aleatorio de 256 bits, no un secreto de baja entropía elegido por una
//     persona: no hay espacio de búsqueda que recorrer, así que el factor de trabajo de bcrypt
//     solo agregaría latencia al camino legítimo.
//  2. El salt aleatorio de bcrypt impide buscar por índice: obligaría a traer todos los tokens
//     vigentes y compararlos uno a uno. SHA-256 es determinista y entra en el UNIQUE de
//     `tokenHash`, así que el consumo es una sola sentencia.
//  3. bcrypt trunca en 72 bytes; el token cabe, pero es un detalle innecesario aquí.
function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex");
}

export const tokenService: GeneradorTokenRecuperacion = {
  generar() {
    const token = randomBytes(BYTES_TOKEN_RECUPERACION).toString("base64url");
    return { token, tokenHash: sha256Hex(token) };
  },

  hashear(token) {
    return sha256Hex(token);
  },
};
