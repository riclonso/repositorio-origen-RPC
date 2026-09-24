import { esAutoOperacion, type Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

export type ResultadoCambiarEstadoUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "AUTO_OPERACION" | "ULTIMO_ADMIN" | "PERFIL_ADMIN_RESTRINGIDO"; rut: string };

// Las reglas anti autobloqueo viven aquí y no en la interfaz, para que no se puedan saltar
// llamando a la API directamente.
export async function cambiarEstadoUsuario(
  id: string,
  activo: boolean,
  actorId: string,
  // Perfil de quien ejecuta la operación (ADMIN o REVISOR_REPOSITORIO: ambos tienen acceso al
  // mantenedor). Se recibe aparte de `dependencias` porque es un dato de identidad del actor, no
  // una dependencia técnica inyectable.
  actorPerfilCodigo: string,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoCambiarEstadoUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Un actor sin perfil ADMIN no puede activar NI desactivar una cuenta ADMIN. A diferencia del
  // bloque de abajo (que solo aplica al desactivar), esta restricción aplica en ambas direcciones.
  if (!esPerfilAdministrador(actorPerfilCodigo) && esPerfilAdministrador(actual.perfilCodigo)) {
    return { ok: false, motivo: "PERFIL_ADMIN_RESTRINGIDO", rut: actual.rut };
  }

  if (!activo) {
    if (esAutoOperacion(actorId, id)) {
      return { ok: false, motivo: "AUTO_OPERACION", rut: actual.rut };
    }

    if (actual.activo && esPerfilAdministrador(actual.perfilCodigo)) {
      if ((await dependencias.repositorio.contarAdminsActivos()) <= 1) {
        return { ok: false, motivo: "ULTIMO_ADMIN", rut: actual.rut };
      }
    }
  }

  const usuario = await dependencias.repositorio.cambiarEstado(id, activo);
  return { ok: true, usuario };
}
