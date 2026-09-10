import { isIP } from "node:net";

// Activar solo si el contenedor es accesible exclusivamente desde un proxy que
// agrega la IP real al FINAL de X-Forwarded-For. Nunca confiar en acceso directo.
export function extraerIp(peticion: Request): string | null {
  if (process.env.TRUST_PROXY !== "true") return null;
  const ip = peticion.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return ip && isIP(ip) ? ip : null;
}

export function extraerUserAgent(peticion: Request): string | null {
  return peticion.headers.get("user-agent")?.slice(0, 200) || null;
}
