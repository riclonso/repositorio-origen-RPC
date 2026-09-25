import { cookies } from "next/headers";
import { getCookie } from "cookies-next/server";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { verificarSesion, type SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";

// La sesión original nunca se expone al navegador: se conserva en una segunda cookie HTTP-only
// mientras el administrador opera temporalmente como otra persona. No se crea un JWT nuevo ni se
// amplía su vencimiento; al volver se restaura exactamente la sesión administrativa que ya existía.
export const NOMBRE_COOKIE_SESION = "sesion";
export const NOMBRE_COOKIE_SESION_ADMIN_ORIGEN = "sesion-admin-origen";

export const OPCIONES_COOKIE_SESION = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 8,
};

// Se usa en el encabezado de los paneles para no mostrar el retorno cuando una cookie vieja ya no
// representa una sesión administrativa válida (por cierre, cambio de contraseña o expiración).
export async function obtenerSesionAdministradorOrigen(): Promise<SesionPayload | null> {
  const token = await getCookie(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN, { cookies });

  if (!token) return null;

  const sesion = await verificarSesion(token);
  return sesion && esPerfilAdministrador(sesion.perfil) ? sesion : null;
}
