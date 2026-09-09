import { cookies } from "next/headers";
import { getCookie } from "cookies-next/server";
import { verificarSesion, type SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";

const NOMBRE_COOKIE_SESION = "sesion";

// Lee y verifica la sesión del request en curso. Se usa desde Route Handlers y Server
// Components; el guard de `src/proxy.ts` corre en Edge y no comparte este código.
export async function obtenerSesionActual(): Promise<SesionPayload | null> {
  const token = await getCookie(NOMBRE_COOKIE_SESION, { cookies });

  if (!token) {
    return null;
  }

  return verificarSesion(token);
}
