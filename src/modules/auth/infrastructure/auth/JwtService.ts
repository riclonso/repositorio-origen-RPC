import { SignJWT, jwtVerify } from "jose";
import { env } from "@/infrastructure/config/env";
import type { EmisorSesion } from "@/modules/auth/application/ports";
import { FORMA_CODIGO_PERFIL } from "@/modules/perfiles/domain/entities/Perfil";

const ALGORITMO = "HS256";
const EXPIRACION = "8h";

function obtenerClaveSecreta() {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export const jwtService: EmisorSesion = {
  async emitir(usuario) {
    return new SignJWT({ perfil: usuario.perfilCodigo })
      .setProtectedHeader({ alg: ALGORITMO })
      .setSubject(usuario.id)
      .setIssuedAt()
      .setExpirationTime(EXPIRACION)
      .sign(obtenerClaveSecreta());
  },
};

export type SesionPayload = {
  sub: string;
  perfil: string;
};

// Valida FORMA, no pertenencia: comprobar el perfil contra una lista cerrada devolvería el
// acoplamiento que el catálogo elimina. Que el perfil siga existiendo y qué puede hacer se
// resuelve más adentro, no en la verificación del token.
//
// El renombre del claim `rol` a `perfil` es además el mecanismo de invalidación de las sesiones
// anteriores al cambio: un token viejo no trae `perfil`, así que esta función devuelve `null` y
// se toma el camino ya probado de "sin sesión" (redirect en el proxy, 401 JSON en la API).
export async function verificarSesion(token: string): Promise<SesionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, obtenerClaveSecreta(), {
      algorithms: [ALGORITMO],
    });

    const { sub, perfil } = payload;

    if (typeof sub !== "string" || sub.length === 0) {
      return null;
    }

    if (typeof perfil !== "string" || !FORMA_CODIGO_PERFIL.test(perfil)) {
      return null;
    }

    return { sub, perfil };
  } catch {
    return null;
  }
}
