import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  esPerfilAdministrador,
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/notificador/:path*", "/revisor/:path*"],
};
