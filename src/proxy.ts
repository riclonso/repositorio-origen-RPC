import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import { verificarSesion } from "@/modules/auth/infrastructure/auth/JwtService";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sesion")?.value;
  const sesion = token ? await verificarSesion(token) : null;

  if (!sesion || !esPerfilAdministrador(sesion.perfil)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard/:path*",
};
