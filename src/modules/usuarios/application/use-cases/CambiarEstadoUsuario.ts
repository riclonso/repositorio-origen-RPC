import { esAutoOperacion, type Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";

export type ResultadoCambiarEstadoUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "AUTO_OPERACION" | "ULTIMO_ADMIN"; rut: string };

// Las reglas anti autobloqueo viven aquí y no en la interfaz, para que no se puedan saltar
// llamando a la API directamente.
export async function cambiarEstadoUsuario(
  id: string,
  activo: boolean,
  actorId: string,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoCambiarEstadoUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
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
