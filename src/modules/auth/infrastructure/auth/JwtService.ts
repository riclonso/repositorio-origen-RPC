import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/infrastructure/config/env";
import type { EmisorSesion } from "@/modules/auth/application/ports";
import { FORMA_CODIGO_PERFIL } from "@/modules/perfiles/domain/entities/Perfil";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";

const ALGORITMO = "HS256";
const EXPIRACION = "8h";

function obtenerClaveSecreta() {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export const jwtService: EmisorSesion = {
  async emitir(usuario) {
    return new SignJWT({ perfil: usuario.perfilCodigo, sesionVersion: usuario.sesionVersion })
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

// Memoizada por REQUEST (no globalmente): `cache()` de React deduplica esta consulta cuando
// `verificarSesion()` se invoca varias veces durante el mismo render/petición (p. ej. un layout y
// una página que ambos leen la sesión), sin arrastrar el resultado de una petición a la siguiente.
const obtenerVersionSesionCacheada = cache((id: string) => prismaUserRepository.obtenerVersionSesion(id));

// Valida FORMA, no pertenencia: comprobar el perfil contra una lista cerrada devolvería el
// acoplamiento que el catálogo elimina. Que el perfil siga existiendo y qué puede hacer se
// resuelve más adentro, no en la verificación del token.
//
// El renombre del claim `rol` a `perfil` (RF-09) fue el mecanismo de invalidación de las sesiones
// anteriores a ESE cambio. Esta entrega agrega un segundo mecanismo, más fino: el claim
// `sesionVersion` se compara contra `usuario.sesionVersion` en la BASE, así que además de la
// forma del token, `verificarSesion()` ahora depende de una consulta a la base de datos. Esto
// significa que la sesión JWT DEJA DE SER puramente stateless (ver `docs/arquitectura.md`): ya no
// basta con verificar la firma y la expiración para confiar en el token, hace falta que la
// versión siga vigente. El efecto colateral es el mismo que el del renombre de RF-09: desplegar
// esta columna invalida, una única vez, todas las sesiones activas del sistema (todo JWT emitido
// antes de este cambio no trae el claim `sesionVersion`, así que la comprobación de forma de abajo
// ya lo descarta sin necesidad de ir a la base).
export async function verificarSesion(token: string): Promise<SesionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, obtenerClaveSecreta(), {
      algorithms: [ALGORITMO],
    });

    const { sub, perfil, sesionVersion } = payload;

    if (typeof sub !== "string" || sub.length === 0) {
      return null;
    }

    if (typeof perfil !== "string" || !FORMA_CODIGO_PERFIL.test(perfil)) {
      return null;
    }

    if (typeof sesionVersion !== "number") {
      return null;
    }

    const versionVigente = await obtenerVersionSesionCacheada(sub);

    if (versionVigente === null || versionVigente !== sesionVersion) {
      return null;
    }

    return { sub, perfil };
  } catch {
    return null;
  }
}
