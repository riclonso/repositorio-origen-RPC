import { variablesSmtpFaltantes } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/logging/logger";
import type { MotivoAuditoria } from "@/infrastructure/logging/auditoria";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import type { SesionPayload } from "@/modules/auth/infrastructure/auth/JwtService";
import type { ResultadoEmitirEnlaceContrasena } from "@/modules/auth/application/use-cases/EmitirEnlaceContrasena";

// Disparador del enlace en el camino admin. El caller lo decide (CREACION en el alta;
// REESTABLECIMIENTO / REENVIO en el mantenedor según la cuenta ya tuviera contraseña o no) y
// solo se usa en el evento EXITO. En los demás desenlaces el motivo lo pone la causa.
export type DisparadorEnlace = Extract<
  MotivoAuditoria,
  "CREACION" | "REESTABLECIMIENTO" | "REENVIO"
>;

// Traduce el desenlace del caso de uso a un evento de auditoría. Espeja al `auditarDesenlace` de
// RF-10, pero para el actor con sesión del mantenedor. Los fallos técnicos (relay sin configurar
// o envío caído) además se registran en `errores.txt`: no enterarse de que el correo no sale es
// el riesgo asumido al declarar opcional el grupo SMTP. Nunca se registra el token ni el correo.
export function auditarDesenlaceEnlace(
  sesion: SesionPayload,
  peticion: Request,
  resultado: ResultadoEmitirEnlaceContrasena,
  disparador: DisparadorEnlace,
): void {
  if (resultado.estado === "ENVIADO") {
    auditarUsuario(sesion, peticion, {
      accion: "ENLACE_CONTRASENA_ENVIADO",
      resultado: "EXITO",
      motivo: disparador,
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  if (resultado.estado === "NO_ENCONTRADO") {
    auditarUsuario(sesion, peticion, {
      accion: "ENLACE_CONTRASENA_ENVIADO",
      resultado: "RECHAZADO",
      motivo: "NO_ENCONTRADO",
    });
    return;
  }

  if (resultado.estado === "CUENTA_INACTIVA") {
    auditarUsuario(sesion, peticion, {
      accion: "ENLACE_CONTRASENA_ENVIADO",
      resultado: "RECHAZADO",
      motivo: "CUENTA_INACTIVA",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  // Rechazo de autorización, no un fallo técnico de correo: sin esta rama caería por defecto en
  // ENVIO_FALLIDO, mezclando ambos casos.
  if (resultado.estado === "PERFIL_ADMIN_RESTRINGIDO") {
    auditarUsuario(sesion, peticion, {
      accion: "ENLACE_CONTRASENA_ENVIADO",
      resultado: "RECHAZADO",
      motivo: "PERFIL_ADMIN_RESTRINGIDO",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  if (resultado.estado === "SIN_CONFIGURACION") {
    logger.error("Emisión de enlace de contraseña con el envío de correo sin configurar", {
      usuarioId: resultado.usuarioId,
      variablesFaltantes: variablesSmtpFaltantes(),
      impacto:
        "La persona no puede fijar su contraseña hasta que se configure el relay SMTP; el administrador puede reenviar el enlace una vez configurado.",
    });
    auditarUsuario(sesion, peticion, {
      accion: "ENLACE_CONTRASENA_ENVIADO",
      resultado: "SIN_EFECTO",
      motivo: "SIN_CONFIGURACION",
      usuarioObjetivoId: resultado.usuarioId,
      usuarioObjetivoRut: resultado.usuarioRut,
    });
    return;
  }

  // ENVIO_FALLIDO: se registra el id de la fila y del usuario, nunca el token ni la dirección.
  logger.error("Error al enviar el enlace de contraseña", {
    tokenId: resultado.tokenId,
    usuarioId: resultado.usuarioId,
    diagnostico: resultado.diagnostico,
  });
  auditarUsuario(sesion, peticion, {
    accion: "ENLACE_CONTRASENA_ENVIADO",
    resultado: "SIN_EFECTO",
    motivo: "ENVIO_FALLIDO",
    usuarioObjetivoId: resultado.usuarioId,
    usuarioObjetivoRut: resultado.usuarioRut,
  });
}
