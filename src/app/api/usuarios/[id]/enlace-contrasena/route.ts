import { NextResponse } from "next/server";
import { registrarFallaCorreo } from "@/infrastructure/logging/fallasCorreo";
import { logger } from "@/infrastructure/logging/logger";
import {
  emitirEnlaceContrasena,
  type ResultadoEmitirEnlaceContrasena,
} from "@/modules/auth/application/use-cases/EmitirEnlaceContrasena";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { prismaPasswordResetTokenRepository } from "@/modules/auth/infrastructure/repositories/PrismaPasswordResetTokenRepository";
import { tokenService } from "@/modules/auth/infrastructure/tokens/TokenService";
import { enlaceContrasenaMailer } from "@/modules/auth/infrastructure/email/EnlaceContrasenaMailer";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import { auditarDesenlaceEnlace } from "@/app/api/usuarios/_lib/auditarEnlace";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idUsuarioSchema,
  respuestaError,
  respuestaPerfilAdminRestringido,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion: "ENLACE_CONTRASENA_ENVIADO",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        usuarioObjetivoId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idUsuarioSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  let resultado: ResultadoEmitirEnlaceContrasena;

  try {
    resultado = await emitirEnlaceContrasena(idValido.data, acceso.sesion.perfil, {
      repositorioUsuarios: prismaUserRepository,
      repositorioTokens: prismaPasswordResetTokenRepository,
      generadorToken: tokenService,
      enviadorCorreo: enlaceContrasenaMailer,
    });
  } catch (error) {
    // RF-44: falla técnica antes de enviar (BD al buscar la cuenta o emitir el token).
    // `registrarFallaCorreo` la deja en `fallas-correo.txt` y además en `errores.txt` (para este
    // aviso, solo nombre y código del error: nunca el mensaje, que puede arrastrar parámetros).
    registrarFallaCorreo({
      tipoAviso: "ENLACE_CONTRASENA_ADMIN",
      etapa: "PREPARACION",
      destinatario: { tipo: "USUARIO", usuarioId: idValido.data },
      error,
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }

  try {
    const disparador =
      (resultado.estado === "ENVIADO" || resultado.estado === "ENVIO_FALLIDO") && resultado.tuvoContrasenaPrevia
        ? "REESTABLECIMIENTO"
        : "REENVIO";

    auditarDesenlaceEnlace(acceso.sesion, request, resultado, disparador);

    if (resultado.estado === "NO_ENCONTRADO") {
      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    if (resultado.estado === "PERFIL_ADMIN_RESTRINGIDO") {
      return respuestaPerfilAdminRestringido();
    }

    if (resultado.estado === "CUENTA_INACTIVA") {
      return respuestaError("Activa la cuenta antes de enviar el enlace", 409, {
        codigo: "CUENTA_INACTIVA",
      });
    }

    if (resultado.estado === "SIN_CONFIGURACION") {
      return respuestaError("El envío de correo no está configurado", 503, {
        codigo: "SIN_CONFIGURACION",
      });
    }

    if (resultado.estado === "ENVIO_FALLIDO") {
      return respuestaError("No se pudo enviar el correo. Intenta nuevamente", 502, {
        codigo: "ENVIO_FALLIDO",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Un fallo de la auditoría (o de armar la respuesta) no es una falla de correo: solo a
    // `errores.txt`, con el nombre del error y sin el mensaje, como antes de RF-44.
    logger.error("Error al auditar o responder la emisión de un enlace de contraseña desde el mantenedor", {
      usuarioId: idValido.data,
      tipo: error instanceof Error ? error.name : "ErrorDesconocido",
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
