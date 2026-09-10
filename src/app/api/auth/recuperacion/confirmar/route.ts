import { logger } from "@/infrastructure/logging/logger";
import { confirmarRecuperacionSchema } from "@/modules/auth/schemas/recuperacion.schema";
import { resetPassword } from "@/modules/auth/application/use-cases/ResetPassword";
import { prismaPasswordResetTokenRepository } from "@/modules/auth/infrastructure/repositories/PrismaPasswordResetTokenRepository";
import { tokenService } from "@/modules/auth/infrastructure/tokens/TokenService";
import { hasheadorContrasena } from "@/modules/auth/infrastructure/auth/PasswordService";
import {
  auditarRecuperacion,
  contextoDePeticion,
} from "@/modules/auth/infrastructure/auditoria/auditarRecuperacion";
import {
  MENSAJE_CUERPO_EXCESIVO,
  MENSAJE_ERROR_INTERNO,
  MENSAJE_LIMITE_INTENTOS,
  MENSAJE_TOKEN_INVALIDO,
  controlarLimitePorIp,
  leerCuerpoJson,
  respuestaError,
  respuestaLimite,
  respuestaOk,
} from "@/app/api/auth/_lib/http";

// Endpoint PÚBLICO y ANÓNIMO, igual que el de solicitud: fuera del matcher de `src/proxy.ts`.

const AMBITO_LIMITE = "recuperacion:confirmar";
const MAXIMO_INTENTOS_POR_IP = 10;
const VENTANA_LIMITE_MINUTOS = 15;

const CODIGO_TOKEN_INVALIDO = "TOKEN_INVALIDO";

export async function POST(request: Request) {
  const contexto = contextoDePeticion(request);
  // Tope de tamaño ANTES de parsear: es un endpoint público y anónimo, y sin esto cualquiera
  // puede hacer que el proceso parsee megabytes de JSON por petición.
  const lectura = await leerCuerpoJson(request);

  if (lectura.estado === "EXCEDE_TOPE") {
    return respuestaError(MENSAJE_CUERPO_EXCESIVO, 413);
  }

  const cuerpo = lectura.cuerpo;

  // Orden deliberado: forma del body (incluida la complejidad de la contraseña) → límite por IP
  // → consumo del token. Validar la contraseña antes no filtra nada sobre el token.
  const contrasena = confirmarRecuperacionSchema.shape.contrasena.safeParse(cuerpo?.contrasena);

  if (!contrasena.success) {
    return respuestaError(contrasena.error.issues[0]?.message ?? MENSAJE_ERROR_INTERNO, 400);
  }

  const limite = controlarLimitePorIp(
    request,
    AMBITO_LIMITE,
    MAXIMO_INTENTOS_POR_IP,
    VENTANA_LIMITE_MINUTOS,
  );

  if (!limite.permitido) {
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_COMPLETADA",
      resultado: "RECHAZADO",
      motivo: "LIMITE_IP",
    });

    return respuestaLimite(MENSAJE_LIMITE_INTENTOS, limite.segundosEspera);
  }

  // Un token con forma incorrecta recibe el MISMO mensaje y código que uno inexistente, vencido,
  // ya usado o invalidado: no se le regala al atacante la señal de que su formato era correcto.
  const token = confirmarRecuperacionSchema.shape.token.safeParse(cuerpo?.token);

  if (!token.success) {
    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_COMPLETADA",
      resultado: "RECHAZADO",
      motivo: "TOKEN_INVALIDO",
    });

    return respuestaError(MENSAJE_TOKEN_INVALIDO, 400, { codigo: CODIGO_TOKEN_INVALIDO });
  }

  try {
    const resultado = await resetPassword(token.data, contrasena.data, {
      repositorioTokens: prismaPasswordResetTokenRepository,
      generadorToken: tokenService,
      hasheadorContrasena,
    });

    if (!resultado.ok) {
      // El log distingue el motivo interno; la respuesta HTTP no.
      auditarRecuperacion(contexto, {
        accion: "RECUPERACION_COMPLETADA",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
      });

      return respuestaError(MENSAJE_TOKEN_INVALIDO, 400, { codigo: CODIGO_TOKEN_INVALIDO });
    }

    auditarRecuperacion(contexto, {
      accion: "RECUPERACION_COMPLETADA",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });

    // No se inicia sesión automáticamente: emitir un JWT al portador de un enlace de correo
    // convertiría el buzón en credencial de sesión directa. El cliente redirige a /login.
    return respuestaOk();
  } catch (error) {
    // Aquí un 500 sí es admisible: para llegar a fallar hay que traer un token válido de alta
    // entropía, así que no hay ningún oráculo que proteger.
    logger.error("Error al confirmar una recuperación de contraseña", {
      error: error instanceof Error ? error.message : String(error),
    });

    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
