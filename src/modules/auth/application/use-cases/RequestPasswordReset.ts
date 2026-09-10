import { puedeIniciarSesion } from "@/modules/auth/domain/entities/User";
import {
  MAXIMO_SOLICITUDES_POR_CUENTA,
  VENTANA_SOLICITUDES_MINUTOS,
  calcularVencimiento,
} from "@/modules/auth/domain/entities/PasswordResetToken";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { PasswordResetTokenRepository } from "@/modules/auth/domain/repositories/PasswordResetTokenRepository";
import type {
  EnviadorCorreoRecuperacion,
  GeneradorTokenRecuperacion,
} from "@/modules/auth/application/ports";

export type ResultadoSolicitudRecuperacion =
  | { enlace: "ENVIADO"; usuarioId: string; usuarioRut: string }
  | { enlace: "SIN_CUENTA" }
  | { enlace: "CUENTA_INACTIVA"; usuarioId: string; usuarioRut: string }
  | { enlace: "LIMITE_ALCANZADO"; usuarioId: string; usuarioRut: string }
  | { enlace: "ENVIO_FALLIDO"; usuarioId: string; usuarioRut: string; tokenId: string }
  | { enlace: "SIN_CONFIGURACION"; usuarioId: string; usuarioRut: string };

export type DependenciasSolicitudRecuperacion = {
  repositorioUsuarios: UserRepository;
  repositorioTokens: PasswordResetTokenRepository;
  generadorToken: GeneradorTokenRecuperacion;
  enviadorCorreo: EnviadorCorreoRecuperacion;
};

/**
 * Emite un enlace de recuperación de contraseña.
 *
 * IMPORTANTE: el resultado discriminado que devuelve esta función existe SOLO para auditar.
 * El Route Handler no puede leerlo para decidir la respuesta HTTP, porque para cuando este
 * resultado existe la respuesta 200 ya se emitió: todo este trabajo corre dentro de un
 * `after()` de `next/server`. Esa imposibilidad física es deliberada, y es lo que hace que el
 * tiempo de respuesta sea estructuralmente independiente de si el correo existe, de si la
 * cuenta está activa y de cuánto tarde el relay SMTP. Es una garantía más fuerte que la del
 * hash de relleno de `LoginUser`, que solo puede igualar el trabajo porque debe responder con
 * el resultado.
 *
 * El email debe llegar ya normalizado (recortado y en minúsculas): lo hace `emailSchema` en el
 * borde. Nunca se registra ni se devuelve la dirección recibida.
 */
export async function requestPasswordReset(
  email: string,
  dependencias: DependenciasSolicitudRecuperacion,
): Promise<ResultadoSolicitudRecuperacion> {
  const usuario = await dependencias.repositorioUsuarios.buscarPorEmail(email);

  if (!usuario) {
    return { enlace: "SIN_CUENTA" };
  }

  // Misma regla de dominio que usa `LoginUser`, no una copia de la condición. Una cuenta
  // desactivada no recibe ningún correo, ni siquiera uno avisando que está inhabilitada: sería
  // un vector de bombardeo dirigido y la persona debe hablar con un administrador de todos
  // modos.
  if (!puedeIniciarSesion(usuario)) {
    return { enlace: "CUENTA_INACTIVA", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  // La comprobación de configuración va DESPUÉS de resolver la cuenta, y no antes, para que el
  // `logger.error` de quien llama pueda decir a qué cuenta se le negó el servicio. Un correo
  // tecleado que no corresponde a ninguna cuenta se resuelve como SIN_CUENTA y no ensucia
  // `errores.txt` con ruido de sondeos. Sigue sin crearse token ni enviarse nada.
  if (!dependencias.enviadorCorreo.disponible()) {
    return { enlace: "SIN_CONFIGURACION", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  const ahora = new Date();
  const { token, tokenHash } = dependencias.generadorToken.generar();

  // El cupo por cuenta NO se comprueba aquí: contar en una consulta y después insertar en otra
  // es un TOCTOU que una ráfaga simultánea evade por completo. El cupo viaja al repositorio y
  // lo decide la base dentro de la misma sentencia que inserta; `crear` devuelve `null` cuando
  // ya está tomado.
  const tokenCreado = await dependencias.repositorioTokens.crear({
    usuarioId: usuario.id,
    tokenHash,
    expiraEn: calcularVencimiento(ahora),
    inicioVentana: new Date(ahora.getTime() - VENTANA_SOLICITUDES_MINUTOS * 60 * 1000),
    maximoPorCuenta: MAXIMO_SOLICITUDES_POR_CUENTA,
  });

  // El cupo por cuenta jamás puede ser observable desde fuera: la respuesta es el mismo 200 de
  // siempre. Hacerlo visible lo convertiría justamente en el oráculo que todo lo demás evita.
  if (!tokenCreado) {
    return { enlace: "LIMITE_ALCANZADO", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  try {
    await dependencias.enviadorCorreo.enviar(
      { email: usuario.email, nombres: usuario.nombres },
      token,
    );
  } catch {
    // Nadie recibió una copia, así que dejar el token vigente dos horas no aporta nada y ensucia
    // el estado. La fila NO se borra: sigue contando para el cupo, para que un relay caído no
    // habilite reintentos ilimitados contra un servicio que no responde.
    await dependencias.repositorioTokens.invalidar(tokenCreado.id);

    return {
      enlace: "ENVIO_FALLIDO",
      usuarioId: usuario.id,
      usuarioRut: usuario.rut,
      tokenId: tokenCreado.id,
    };
  }

  return { enlace: "ENVIADO", usuarioId: usuario.id, usuarioRut: usuario.rut };
}
