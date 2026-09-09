import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setCookie } from "cookies-next/server";
import { loginSchema } from "@/modules/auth/schemas/login.schema";
import { loginUser } from "@/modules/auth/application/use-cases/LoginUser";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { passwordService } from "@/modules/auth/infrastructure/auth/PasswordService";
import { jwtService } from "@/modules/auth/infrastructure/auth/JwtService";
import { logger } from "@/infrastructure/logging/logger";

const MENSAJE_ERROR_GENERICO = "RUT o contraseña incorrectos";

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);

  const datos = loginSchema.safeParse({
    rut: cuerpo?.rut,
    contrasena: cuerpo?.contrasena,
  });

  if (!datos.success) {
    return NextResponse.json(
      { error: datos.error.issues[0]?.message ?? MENSAJE_ERROR_GENERICO },
      { status: 400 },
    );
  }

  let resultado;

  try {
    resultado = await loginUser(datos.data.rut, datos.data.contrasena, {
      repositorio: prismaUserRepository,
      verificadorContrasena: passwordService,
      emisorSesion: jwtService,
    });
  } catch (error) {
    logger.error("Error al autenticar usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: MENSAJE_ERROR_GENERICO }, { status: 500 });
  }

  if (!resultado.ok) {
    return NextResponse.json({ error: MENSAJE_ERROR_GENERICO }, { status: 401 });
  }

  try {
    await setCookie("sesion", resultado.token, {
      cookies,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  } catch (error) {
    logger.error("Error al establecer la cookie de sesión", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: MENSAJE_ERROR_GENERICO }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
