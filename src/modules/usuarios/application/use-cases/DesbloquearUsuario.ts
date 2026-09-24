import { estaBloqueada } from "@/modules/usuarios/domain/entities/Usuario";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";

export type ResultadoDesbloquearUsuario =
  | { ok: true; id: string; rut: string }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "PERFIL_ADMIN_RESTRINGIDO"; rut: string }
  // No es un rechazo: la cuenta existe y el actor tiene permiso, pero ya no estaba bloqueada
  // (el bloqueo venció solo, o alguien más ya la desbloqueó). Mismo concepto que RF-10.
  | { ok: false; motivo: "SIN_EFECTO"; rut: string };

// Desbloqueo MANUAL desde el mantenedor de usuarios. `vecesBloqueada` se conserva sin cambios
// (ver `repositorio.desbloquear`): es monotónico de por vida y sigue determinando la duración del
// PRÓXIMO bloqueo aunque este se haya levantado a mano.
export async function desbloquearUsuario(
  id: string,
  // Perfil de quien ejecuta la operación (ADMIN o REVISOR_REPOSITORIO: ambos tienen acceso al
  // mantenedor). Se recibe aparte de `dependencias` porque es un dato de identidad del actor, no
  // una dependencia técnica inyectable.
  actorPerfilCodigo: string,
  ahora: Date,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoDesbloquearUsuario> {
  const usuario = await dependencias.repositorio.obtenerPorId(id);

  if (!usuario) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Mismo criterio que el resto del mantenedor: un actor sin perfil ADMIN no puede operar sobre
  // una cuenta ADMIN.
  if (!esPerfilAdministrador(actorPerfilCodigo) && esPerfilAdministrador(usuario.perfilCodigo)) {
    return { ok: false, motivo: "PERFIL_ADMIN_RESTRINGIDO", rut: usuario.rut };
  }

  if (!estaBloqueada(usuario, ahora)) {
    return { ok: false, motivo: "SIN_EFECTO", rut: usuario.rut };
  }

  await dependencias.repositorio.desbloquear(id);

  return { ok: true, id: usuario.id, rut: usuario.rut };
}
