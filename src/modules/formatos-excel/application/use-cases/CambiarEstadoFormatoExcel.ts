import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { BloqueoFormatoUnico } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import { ConflictoConcurrenteError } from "@/modules/formatos-excel/domain/errors/ConflictoConcurrenteError";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoCambiarEstadoFormatoExcel =
  | {
      ok: true;
      // `SIN_CAMBIO` solo se da al desactivar un formato ya inactivo: no se tocan sus asignaciones
      // heredadas. Activar no restaura asignaciones quitadas en una desactivación anterior.
      cambio: "ACTIVADO" | "DESACTIVADO" | "SIN_CAMBIO";
      formato: FormatoExcel;
      asignacionesEliminadasUsuarioIds: string[];
    }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "FORMATO_UNICO_DE_NOTIFICADORES"; nombre: string; bloqueo: BloqueoFormatoUnico }
  | { ok: false; motivo: "CONFLICTO_CONCURRENTE" };

// Desactivar un formato le quita el formato a todos los usuarios que lo tenían asignado, en la
// misma transacción que fija `activo=false`. Se bloquea si es el único formato de algún
// NOTIFICADOR_RPC (activo o inactivo): dejarlo sin formatos rompería la invariante del perfil.
export async function cambiarEstadoFormatoExcel(
  id: string,
  activo: boolean,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoCambiarEstadoFormatoExcel> {
  if (activo) {
    const actual = await dependencias.repositorio.obtenerPorId(id);
    if (!actual) return { ok: false, motivo: "NO_ENCONTRADO" };

    const formato = await dependencias.repositorio.cambiarEstado(id, true);
    return { ok: true, cambio: "ACTIVADO", formato, asignacionesEliminadasUsuarioIds: [] };
  }

  try {
    const resultado = await dependencias.repositorio.desactivarQuitandoAsignaciones(id);

    switch (resultado.estado) {
      case "NO_ENCONTRADO":
        return { ok: false, motivo: "NO_ENCONTRADO" };
      case "BLOQUEADO":
        return {
          ok: false,
          motivo: "FORMATO_UNICO_DE_NOTIFICADORES",
          nombre: resultado.nombre,
          bloqueo: resultado.bloqueo,
        };
      case "SIN_CAMBIO":
        return { ok: true, cambio: "SIN_CAMBIO", formato: resultado.formato, asignacionesEliminadasUsuarioIds: [] };
      case "DESACTIVADO":
        return {
          ok: true,
          cambio: "DESACTIVADO",
          formato: resultado.formato,
          asignacionesEliminadasUsuarioIds: resultado.asignacionesEliminadasUsuarioIds,
        };
    }
  } catch (error) {
    if (error instanceof ConflictoConcurrenteError) return { ok: false, motivo: "CONFLICTO_CONCURRENTE" };
    throw error;
  }
}
