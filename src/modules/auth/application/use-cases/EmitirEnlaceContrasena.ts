import { puedeRecibirEnlaceContrasena } from "@/modules/auth/domain/entities/User";
import {
  HORAS_VIGENCIA_TOKEN_ADMIN,
  calcularVencimiento,
  type ContextoEnlace,
} from "@/modules/auth/domain/entities/PasswordResetToken";
import type { UserRepository } from "@/modules/auth/domain/repositories/UserRepository";
import type { PasswordResetTokenRepository } from "@/modules/auth/domain/repositories/PasswordResetTokenRepository";
import type {
  EnviadorCorreoRecuperacion,
  GeneradorTokenRecuperacion,
} from "@/modules/auth/application/ports";
import { describirFalloEnvio } from "@/modules/auth/application/describirFalloEnvio";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";

// Emite un enlace de contraseña iniciado por el ADMINISTRADOR: al crear una cuenta, al
// restablecer la contraseña de un tercero o al reenviar un enlace de activación. Los tres son la
// MISMA operación (emitir un enlace admin de 8 horas); el disparador concreto vive en la
// auditoría, no aquí.
//
// A diferencia del autoservicio (`RequestPasswordReset`), este caso de uso NO es un oráculo ni
// tiene anti-enumeración: quien lo invoca ya está autenticado con acceso al mantenedor (ADMIN o
// REVISOR_REPOSITORIO) y el Route Handler ESPERA el desenlace para devolvérselo. Tampoco lleva
// cupo por cuenta: es una acción autenticada, no un formulario público. La invariante "todo
// enlace admin nuevo invalida los vigentes de la cuenta" la garantiza `emitirParaAdmin` en su
// transacción.
//
// El correo NUNCA lleva la contraseña, solo el enlace. El token en claro vive únicamente en
// memoria durante esta llamada y dentro del correo.

export type ResultadoEmitirEnlaceContrasena =
  // En éxito, `tuvoContrasenaPrevia` distingue el motivo de auditoría (REESTABLECIMIENTO si la
  // cuenta ya tenía contraseña, REENVIO si seguía pendiente). Nunca vuelve el hash.
  | { estado: "ENVIADO"; usuarioId: string; usuarioRut: string; tuvoContrasenaPrevia: boolean }
  | { estado: "NO_ENCONTRADO" }
  | { estado: "CUENTA_INACTIVA"; usuarioId: string; usuarioRut: string }
  | { estado: "SIN_CONFIGURACION"; usuarioId: string; usuarioRut: string }
  | { estado: "PERFIL_ADMIN_RESTRINGIDO"; usuarioId: string; usuarioRut: string }
  | {
      estado: "ENVIO_FALLIDO";
      usuarioId: string;
      usuarioRut: string;
      tokenId: string;
      // Diagnóstico del relay, ya saneado (sin dirección de correo).
      diagnostico: string;
    };

export type DependenciasEmitirEnlaceContrasena = {
  repositorioUsuarios: UserRepository;
  repositorioTokens: PasswordResetTokenRepository;
  generadorToken: GeneradorTokenRecuperacion;
  enviadorCorreo: EnviadorCorreoRecuperacion;
};

export async function emitirEnlaceContrasena(
  usuarioId: string,
  // Perfil de quien ejecuta la operación (ADMIN o REVISOR_REPOSITORIO: ambos tienen acceso al
  // mantenedor). Se recibe aparte de `dependencias` porque es un dato de identidad del actor, no
  // una dependencia técnica inyectable.
  actorPerfilCodigo: string,
  dependencias: DependenciasEmitirEnlaceContrasena,
): Promise<ResultadoEmitirEnlaceContrasena> {
  const usuario = await dependencias.repositorioUsuarios.buscarPorId(usuarioId);

  if (!usuario) {
    return { estado: "NO_ENCONTRADO" };
  }

  // Un actor sin perfil ADMIN no puede emitir un enlace de contraseña (alta, restablecimiento o
  // reenvío) para una cuenta ADMIN.
  if (!esPerfilAdministrador(actorPerfilCodigo) && esPerfilAdministrador(usuario.perfilCodigo)) {
    return { estado: "PERFIL_ADMIN_RESTRINGIDO", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  // Una cuenta desactivada no recibe enlace: hay que reactivarla primero desde el mantenedor.
  if (!puedeRecibirEnlaceContrasena(usuario)) {
    return { estado: "CUENTA_INACTIVA", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  if (!dependencias.enviadorCorreo.disponible()) {
    return { estado: "SIN_CONFIGURACION", usuarioId: usuario.id, usuarioRut: usuario.rut };
  }

  // El hash nulo significa cuenta pendiente: el correo habla de "activar la cuenta". Si ya tiene
  // contraseña, el enlace la reemplaza y el copy es el de recuperación.
  const tuvoContrasenaPrevia = usuario.contrasenaHash !== null;
  const contexto: ContextoEnlace = tuvoContrasenaPrevia ? "recuperacion" : "activacion";

  const ahora = new Date();
  const { token, tokenHash } = dependencias.generadorToken.generar();

  const tokenCreado = await dependencias.repositorioTokens.emitirParaAdmin({
    usuarioId: usuario.id,
    tokenHash,
    expiraEn: calcularVencimiento(ahora, HORAS_VIGENCIA_TOKEN_ADMIN),
  });

  try {
    await dependencias.enviadorCorreo.enviar(
      { email: usuario.email, nombres: usuario.nombres },
      token,
      { horasVigencia: HORAS_VIGENCIA_TOKEN_ADMIN, contexto },
    );
  } catch (error) {
    // Nadie recibió una copia: se invalida el token recién creado para no dejarlo vigente ocho
    // horas sin destinatario.
    await dependencias.repositorioTokens.invalidar(tokenCreado.id);

    return {
      estado: "ENVIO_FALLIDO",
      usuarioId: usuario.id,
      usuarioRut: usuario.rut,
      tokenId: tokenCreado.id,
      diagnostico: describirFalloEnvio(error),
    };
  }

  return {
    estado: "ENVIADO",
    usuarioId: usuario.id,
    usuarioRut: usuario.rut,
    tuvoContrasenaPrevia,
  };
}
