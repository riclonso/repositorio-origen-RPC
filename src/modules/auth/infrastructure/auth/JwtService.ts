import { SignJWT, jwtVerify } from "jose";
import { env } from "@/infrastructure/config/env";
import type { EmisorSesion } from "@/modules/auth/application/ports";
import type { Rol } from "@/modules/auth/domain/entities/User";

const ALGORITMO = "HS256";
const EXPIRACION = "8h";

function obtenerClaveSecreta() {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export const jwtService: EmisorSesion = {
  async emitir(usuario) {
    return new SignJWT({ rol: usuario.rol })
      .setProtectedHeader({ alg: ALGORITMO })
      .setSubject(usuario.id)
      .setIssuedAt()
      .setExpirationTime(EXPIRACION)
      .sign(obtenerClaveSecreta());
  },
};

export type SesionPayload = {
  sub: string;
  rol: Rol;
};

export async function verificarSesion(token: string): Promise<SesionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, obtenerClaveSecreta(), {
      algorithms: [ALGORITMO],
    });

    if (typeof payload.sub !== "string" || (payload.rol !== "ADMIN" && payload.rol !== "USUARIO")) {
      return null;
    }

    return { sub: payload.sub, rol: payload.rol };
  } catch {
    return null;
  }
}
