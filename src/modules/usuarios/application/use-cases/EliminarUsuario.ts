import { esAutoOperacion } from "@/modules/usuarios/domain/entities/Usuario";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";
import type { UsuarioRepository } from "@/modules/usuarios/domain/repositories/UsuarioRepository";
import { ConflictoConcurrenteError } from "@/modules/usuarios/domain/errors/ConflictoConcurrenteError";

export type ResultadoEliminarUsuario =
  | { ok: true; rut: string; perfilCodigo: string; formatosQuitadosIds: string[] }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | {
      ok: false;
      motivo: "PERFIL_ADMIN_RESTRINGIDO" | "AUTO_OPERACION" | "ULTIMO_ADMIN" | "CONFLICTO_CONCURRENTE";
      rut: string;
    }
  | { ok: false; motivo: "CON_HISTORIAL"; rut: string; relacionesBloqueantes: string[] };

// Eliminación física de una cuenta SIN historial (RF-25). Una cuenta con cualquier rastro en el
// sistema (cargas, decisiones, ventanas, alertas...) solo puede desactivarse. Las reglas viven
// aquí y en el repositorio (atómico), nunca solo en la UI, para que no se salten llamando a la API.
// Pendiente de activación, bloqueada por intentos o inactiva NO impiden eliminar.
export async function eliminarUsuario(
  id: string,
  actorId: string,
  // Perfil de quien ejecuta la operación (ADMIN o REVISOR_REPOSITORIO), mismo criterio que
  // `cambiarEstadoUsuario`: dato de identidad del actor, no una dependencia inyectable.
  actorPerfilCodigo: string,
  dependencias: { repositorio: UsuarioRepository },
): Promise<ResultadoEliminarUsuario> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  // Antes que la autooperación, igual que en `cambiarEstadoUsuario`: un actor sin perfil ADMIN no
  // puede operar sobre una cuenta ADMIN, sea o no la propia.
  const actorEsAdmin = esPerfilAdministrador(actorPerfilCodigo);

  // Chequeo previo (respuesta rápida); el repositorio lo revalida sobre la fila bloqueada.
  if (!actorEsAdmin && esPerfilAdministrador(actual.perfilCodigo)) {
    return { ok: false, motivo: "PERFIL_ADMIN_RESTRINGIDO", rut: actual.rut };
  }

  if (esAutoOperacion(actorId, id)) {
    return { ok: false, motivo: "AUTO_OPERACION", rut: actual.rut };
  }

  try {
    const resultado = await dependencias.repositorio.eliminar(id, actorEsAdmin);

    switch (resultado.estado) {
      case "ELIMINADO":
        return {
          ok: true,
          rut: resultado.rut,
          perfilCodigo: resultado.perfilCodigo,
          formatosQuitadosIds: resultado.formatosQuitadosIds,
        };
      case "NO_ENCONTRADO":
        // Doble eliminación concurrente: otra petición la borró entre la lectura y la transacción.
        return { ok: false, motivo: "NO_ENCONTRADO" };
      case "PERFIL_ADMIN_RESTRINGIDO":
        // Ascendida a ADMIN entre la lectura previa y el bloqueo: mismo desenlace que el chequeo
        // previo (403 y misma auditoría en el handler).
        return { ok: false, motivo: "PERFIL_ADMIN_RESTRINGIDO", rut: resultado.rut };
      case "ULTIMO_ADMIN":
        return { ok: false, motivo: "ULTIMO_ADMIN", rut: resultado.rut };
      case "CON_HISTORIAL":
        return {
          ok: false,
          motivo: "CON_HISTORIAL",
          rut: resultado.rut,
          relacionesBloqueantes: resultado.relacionesBloqueantes,
        };
    }
  } catch (error) {
    if (error instanceof ConflictoConcurrenteError) {
      return { ok: false, motivo: "CONFLICTO_CONCURRENTE", rut: actual.rut };
    }
    throw error;
  }
}
