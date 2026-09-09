import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verificarSesion } from "@/modules/auth/infrastructure/auth/JwtService";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sesion")?.value;
  const sesion = token ? await verificarSesion(token) : null;

  if (!sesion || sesion.rol !== "ADMIN") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/dashboard/:path*",
};
