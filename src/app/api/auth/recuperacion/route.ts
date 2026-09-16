import { after } from "next/server";
import { variablesSmtpFaltantes } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import { solicitarRecuperacionSchema } from "@/modules/auth/schemas/recuperacion.schema";
import { requestPasswordReset } from "@/modules/auth/application/use-cases/RequestPasswordReset";
import { prismaUserRepository } from "@/modules/auth/infrastructure/repositories/PrismaUserRepository";
import { prismaPasswordResetTokenRepository } from "@/modules/auth/infrastructure/repositories/PrismaPasswordResetTokenRepository";
import { tokenService } from "@/modules/auth/infrastructure/tokens/TokenService";
import { enlaceContrasenaMailer } from "@/modules/auth/infrastructure/email/EnlaceContrasenaMailer";
import {
  auditarRecuperacion,
  contextoDePeticion,
  type ContextoPeticion,
} from "@/modules/auth/infrastructure/auditoria/auditarRecuperacion";
import type { ResultadoSolicitudRecuperacion } from "@/modules/auth/application/use-cases/RequestPasswordReset";
import {
  MENSAJE_CUERPO_EXCESIVO,
  MENSAJE_EMAIL_INVALIDO,
  MENSAJE_LIMITE_SOLICITUDES,
  controlarLimitePorIp,
  leerCuerpoJson,
  respuestaError,
  respuestaLimite,
  respuestaOk,
} from "@/app/api/auth/_lib/http";

// Endpoint PÚBLICO y ANÓNIMO. No entra al matcher de `src/proxy.ts` a propósito: agregarlo
// redirigiría a /login a todo el mundo y rompería el flujo entero.

const AMBITO_LIMITE = "recuperacion:solicitar";
const MAXIMO_SOLICITUDES_POR_IP = 5;
const VENTANA_LIMITE_MINUTOS = 15;

// El resultado del caso de uso solo alimenta la auditoría: para cuando existe, la respuesta ya
// salió. Ver el comentario de `RequestPasswordReset`.
function auditarDesenlace(
  contexto: ContextoPeticion,
  resultado: ResultadoSolicitudRecuperacion,
): void {
  if (resultado.enlace === "ENVIADO") {
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_SOLICITADA",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  if (resultado.enlace === "SIN_CUENTA") {
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_SOLICITADA",
      resultado: "SIN_EFECTO",
      motivo: "CUENTA_INEXISTENTE",
    });
    return;
  }

  if (resultado.enlace === "SIN_CONFIGURACION") {
    // Se registra además como error: desplegar sin relay y no enterarse es el riesgo asumido al
    // declarar opcionales las variables SMTP. El log lleva la cuenta afectada (contar
    // `usuarioId` distintos da cuántas personas quedaron sin autoservicio) y qué variables hay
    // que definir para arreglarlo. Nunca lleva la dirección tecleada.
    logger.error("Solicitud de recuperación con el envío de correo sin configurar", {
      usuarioId: resultado.usuarioId,
      variablesFaltantes: variablesSmtpFaltantes(),
      impacto:
        "La cuenta no puede recuperar su contraseña por autoservicio hasta que se configure el relay SMTP; entretanto debe restablecerla un administrador desde el mantenedor.",
    });
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_SOLICITADA",
      resultado: "SIN_EFECTO",
      motivo: "SIN_CONFIGURACION",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  if (resultado.enlace === "ENVIO_FALLIDO") {
    // Se registran el id de la fila y el del usuario, nunca el token ni la dirección de destino.
    logger.error("Error al enviar el correo de recuperación", {
      tokenId: resultado.tokenId,
      usuarioId: resultado.usuarioId,
      diagnostico: resultado.diagnostico,
    });
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_SOLICITADA",
      resultado: "SIN_EFECTO",
      motivo: "ENVIO_FALLIDO",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  auditarRecuperacion(contexto, {
    accion: "RECUPERACION_SOLICITADA",
    resultado: "SIN_EFECTO",
    motivo: resultado.enlace === "CUENTA_INACTIVA" ? "CUENTA_INACTIVA" : "LIMITE_ALCANZADO",
    usuarioObjetivoId: resultado.usuarioId,
    usuarioObjetivoRut: resultado.usuarioRut,
  });
}

export async function POST(request: Request) {
  // IP y user agent se leen ANTES de entrar al callback diferido y se pasan por closure: dentro
  // de `after` la petición ya terminó.
  const contexto = contextoDePeticion(request);

  // Tope de tamaño ANTES de parsear: es un endpoint público y anónimo, y sin esto cualquiera
  // puede hacer que el proceso parsee megabytes de JSON por petición.
  const lectura = await leerCuerpoJson(request);

  if (lectura.estado === "EXCEDE_TOPE") {
    return respuestaError(MENSAJE_CUERPO_EXCESIVO, 413);
  }

  const datos = solicitarRecuperacionSchema.safeParse({ email: lectura.cuerpo?.email });

  // Un cuerpo mal formado se rechaza sin decir nada sobre la existencia de cuentas.
  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_EMAIL_INVALIDO, 400);
  }

  const limite = controlarLimitePorIp(
    request,
    AMBITO_LIMITE,
    MAXIMO_SOLICITUDES_POR_IP,
    VENTANA_LIMITE_MINUTOS,
  );

  if (!limite.permitido) {
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_SOLICITADA",
      resultado: "RECHAZADO",
      motivo: "LIMITE_IP",
    });

    return respuestaLimite(MENSAJE_LIMITE_SOLICITUDES, limite.segundosEspera);
  }

  const email = datos.data.email;

  // Todo el trabajo dependiente del correo va aquí, DESPUÉS de que la respuesta terminó de
  // emitirse. Con esto el tiempo de respuesta es el de un parse de JSON más una lectura de un
  // Map: estructuralmente independiente de si la cuenta existe, de si está activa y de cuánto
  // tarde el relay SMTP. No hay ningún retardo artificial que calibrar.
  //
  // El resultado NO puede consultarse para decidir la respuesta: cuando existe, el 200 ya se
  // envió. Esa imposibilidad es deliberada.
  after(async () => {
    try {
      const resultado = await requestPasswordReset(email, {
        repositorioUsuarios: prismaUserRepository,
        repositorioTokens: prismaPasswordResetTokenRepository,
        generadorToken: tokenService,
        enviadorCorreo: enlaceContrasenaMailer,
      });

      auditarDesenlace(contexto, resultado);
    } catch (error) {
      // Salvaguarda, no el mecanismo principal: un 500 en el camino "la cuenta existe" mientras
      // el camino "no existe" responde 200 sería un oráculo. Aquí ni siquiera es posible,
      // porque la respuesta ya salió.
      logger.error("Error al procesar una solicitud de recuperación de contraseña", {
        tipo: error instanceof Error ? error.name : "ErrorDesconocido",
      });
    }
  });

  // Respuesta idéntica exista o no la cuenta, esté activa o no, se haya enviado el correo o no.
  return respuestaOk();
}
