import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteCookie, setCookie } from "cookies-next/server";
import { decodeJwt } from "jose";
import { loginSchema } from "@/modules/auth/schemas/login.schema";
import { loginUser } from "@/modules/auth/application/use-cases/LoginUser";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { passwordService } from "@/modules/auth/infrastructure/auth/PasswordService";
import { jwtService } from "@/modules/auth/infrastructure/auth/JwtService";
import { logger } from "@/infrastructure/logging/logger";
import { registrarAcceso } from "@/infrastructure/logging/accesos";
import { extraerIp } from "@/shared/utils/peticion";
import { NOMBRE_COOKIE_SESION_ADMIN_ORIGEN } from "@/modules/auth/infrastructure/auth/SesionDelegada";

const MENSAJE_ERROR_GENERICO = "RUT o contraseña incorrectos";
const MINUTOS_EN_MS = 60_000;

function mensajeCuentaBloqueada(bloqueadaHasta: Date, ahora: Date): string {
  const minutosRestantes = Math.ceil((bloqueadaHasta.getTime() - ahora.getTime()) / MINUTOS_EN_MS);
  const minutos = Math.max(minutosRestantes, 1);
  const unidad = minutos === 1 ? "minuto" : "minutos";

  return `Tu cuenta ha sido bloqueada por múltiples intentos fallidos. Intenta nuevamente en ${minutos} ${unidad}.`;
}

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const ip = extraerIp(request);

  const datos = loginSchema.safeParse({
    rut: cuerpo?.rut,
    contrasena: cuerpo?.contrasena,
  });

  if (!datos.success) {
    // Solo se deja rastro en `logs/accesos.txt` cuando el propio RUT es el campo inválido: es el
    // único motivo de validación que el log distingue (ver `EventoAcceso` en
    // `infrastructure/logging/accesos.ts`); un cuerpo con la contraseña vacía, por ejemplo, no
    // constituye un intento identificable por RUT.
    const esRutInvalido = datos.error.issues.some((problema) => problema.path[0] === "rut");

    if (esRutInvalido) {
      registrarAcceso({
        evento: "login_fallido",
        rut: typeof cuerpo?.rut === "string" ? cuerpo.rut : "",
        motivo: "rut_invalido",
        ip,
      });
    }

    return NextResponse.json(
      { error: datos.error.issues[0]?.message ?? MENSAJE_ERROR_GENERICO },
      { status: 400 },
    );
  }

  const ahora = new Date();
  let resultado;

  try {
    resultado = await loginUser(datos.data.rut, datos.data.contrasena, ahora, {
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
    if (resultado.motivoInterno === "CUENTA_BLOQUEADA") {
      registrarAcceso({
        evento: "login_fallido",
        rut: datos.data.rut,
        motivo: "cuenta_bloqueada",
        ip,
      });

      return NextResponse.json(
        { error: mensajeCuentaBloqueada(resultado.bloqueadaHasta, ahora) },
        { status: 401 },
      );
    }

    // `ResultadoLogin` colapsa "RUT inexistente", "cuenta pendiente" y "cuenta inactiva" en el
    // mismo motivo `CREDENCIALES_INVALIDAS` (mismo criterio anti-enumeración que el hash de
    // relleno de `LoginUser.ts`: ninguna señal distinta hacia afuera), así que aquí también se
    // registra un único motivo `credenciales_invalidas`. El motivo `usuario_inactivo` queda
    // declarado en `EventoAcceso` para cuando el caso de uso distinga esa rama explícitamente,
    // pero esta entrega no lo emite.
    registrarAcceso({
      evento: "login_fallido",
      rut: datos.data.rut,
      motivo: "credenciales_invalidas",
      ip,
    });

    return NextResponse.json({ error: MENSAJE_ERROR_GENERICO }, { status: 401 });
  }

  try {
    // Un nuevo login siempre empieza limpio: una cookie de retorno de una delegación anterior no
    // puede sobrevivir al cambio explícito de identidad.
    await deleteCookie(NOMBRE_COOKIE_SESION_ADMIN_ORIGEN, { cookies, path: "/" });
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

  // `ResultadoLogin` solo trae el token (contrato ya fijado por el diseño aprobado), así que el
  // `usuarioId` del log de accesos se lee del propio claim `sub` del JWT recién firmado: se
  // DECODIFICA sin volver a verificar (la firma es la que este mismo proceso acaba de generar,
  // no hace falta autenticarla contra sí misma) en vez de repetir la consulta a la base de datos.
  const { sub } = decodeJwt(resultado.token);

  registrarAcceso({
    evento: "login_exitoso",
    rut: datos.data.rut,
    usuarioId: typeof sub === "string" ? sub : "",
    ip,
  });

  return NextResponse.json({ ok: true });
}
