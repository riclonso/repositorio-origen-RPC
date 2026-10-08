import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  esPerfilAdministrador,
  esPerfilBioestadistica,
  esPerfilNotificador,
  esPerfilRevisorRepositorio,
} from "@/modules/perfiles/domain/entities/Perfil";
import { verificarSesion } from "@/modules/auth/infrastructure/auth/JwtService";

// Guard único de navegación. Cada área top-level mapea 1:1 a un perfil, de modo que se mantiene la
// invariante "todo /dashboard es solo-ADMIN": el chequeo de perfil es POSITIVO por área, no una
// lista de exclusiones. El despachador /inicio decide a qué panel mandar a cada sesión, por eso un
// perfil que no corresponde al área se reenvía ahí en vez de mostrar un 403.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sesion")?.value;
  const sesion = token ? await verificarSesion(token) : null;

  if (!sesion) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const ruta = request.nextUrl.pathname;

  if (ruta.startsWith("/dashboard") && !esPerfilAdministrador(sesion.perfil)) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  if (ruta.startsWith("/notificador") && !esPerfilNotificador(sesion.perfil)) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  if (ruta.startsWith("/revisor") && !esPerfilRevisorRepositorio(sesion.perfil)) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  // RF-37: área del perfil Bioestadística, mismo chequeo positivo.
  if (ruta.startsWith("/bioestadistica") && !esPerfilBioestadistica(sesion.perfil)) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  return NextResponse.next();
}

// INVARIANTE (RF-37): `/api/**` NUNCA debe entrar a este matcher. Cuando el proxy intercepta una
// petición, Next copia el cuerpo en memoria con un límite por defecto de 10 MB y lo TRUNCA sin dar
// error (`proxyClientMaxBodySize`, ver
// node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md):
// agregar `/api/bioestadistica` corrompería en silencio las subidas de hasta 300 MB. Los Route
// Handlers se protegen con su propio guard (`exigirBioestadistica`, `exigirAdminORevisor`, ...).
export const config = {
  matcher: ["/dashboard/:path*", "/notificador/:path*", "/revisor/:path*", "/bioestadistica/:path*"],
};
