import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";
import { TipoEstablecimientoEnUsoError } from "@/modules/tipoEstablecimiento/domain/errors/TipoEstablecimientoEnUsoError";

export type ResultadoEliminarTipoEstablecimiento =
  | { ok: true }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "EN_USO" };

// RF-29: eliminación FÍSICA de un tipo sin uso (activo o inactivo). No hay pre-chequeo de conteo:
// la FK `establecimiento.tipoId` (ON DELETE RESTRICT) es la única fuente de verdad y corta el DELETE
// de un tipo usado por cualquier establecimiento, activo o inactivo, sin ventana de carrera. Aquí se
// traduce a `EN_USO` en vez de propagarse como un error técnico. Un tipo en uso solo se desactiva.
export async function eliminarTipoEstablecimiento(
  id: string,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<ResultadoEliminarTipoEstablecimiento> {
  try {
    const eliminado = await dependencias.repositorio.eliminar(id);
    return eliminado ? { ok: true } : { ok: false, motivo: "NO_ENCONTRADO" };
  } catch (error) {
    if (error instanceof TipoEstablecimientoEnUsoError) {
      return { ok: false, motivo: "EN_USO" };
    }

    throw error;
  }
}
