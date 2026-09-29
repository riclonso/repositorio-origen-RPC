import type { BloqueoFormatoUnico } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import { ConflictoConcurrenteError } from "@/modules/formatos-excel/domain/errors/ConflictoConcurrenteError";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoEliminarFormatoExcel =
  | { ok: true; nombre: string }
  | { ok: false; motivo: "NO_ENCONTRADO" | "CON_VENTANAS_ACTIVAS" | "CONFLICTO_CONCURRENTE"; nombre?: string }
  | { ok: false; motivo: "FORMATO_UNICO_DE_NOTIFICADORES"; nombre: string; bloqueo: BloqueoFormatoUnico };

// Mismo bloqueo que la desactivación: no se elimina un formato que es el único de algún
// NOTIFICADOR_RPC (activo o inactivo). El repositorio lo rechequea dentro de la transacción.
export async function eliminarFormatoExcel(
  id: string,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoEliminarFormatoExcel> {
  const formato = await dependencias.repositorio.obtenerPorId(id);
  if (!formato) return { ok: false, motivo: "NO_ENCONTRADO" };

  try {
    const resultado = await dependencias.repositorio.eliminar(id);

    switch (resultado.estado) {
      case "ELIMINADO":
        return { ok: true, nombre: formato.nombre };
      case "NO_ENCONTRADO":
        return { ok: false, motivo: "NO_ENCONTRADO" };
      case "CON_VENTANAS_ACTIVAS":
        return { ok: false, motivo: "CON_VENTANAS_ACTIVAS", nombre: formato.nombre };
      case "BLOQUEADO":
        return {
          ok: false,
          motivo: "FORMATO_UNICO_DE_NOTIFICADORES",
          nombre: formato.nombre,
          bloqueo: resultado.bloqueo,
        };
    }
  } catch (error) {
    if (error instanceof ConflictoConcurrenteError) {
      return { ok: false, motivo: "CONFLICTO_CONCURRENTE", nombre: formato.nombre };
    }
    throw error;
  }
}
