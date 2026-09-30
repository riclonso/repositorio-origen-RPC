import type { RegionRepository } from "@/modules/regiones/domain/repositories/RegionRepository";
import { RegionEnUsoError } from "@/modules/regiones/domain/errors/RegionEnUsoError";

export type ResultadoEliminarRegion =
  | { ok: true }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "EN_USO" };

// Eliminación FÍSICA (la región no tiene `activo`). Hoy nada referencia a `region`; si en el
// futuro alguna tabla lo hace con FK `Restrict`, la base corta el DELETE y aquí se traduce a
// `EN_USO` en vez de propagarse como un error técnico.
export async function eliminarRegion(
  id: string,
  dependencias: { repositorio: RegionRepository },
): Promise<ResultadoEliminarRegion> {
  try {
    const eliminada = await dependencias.repositorio.eliminar(id);
    return eliminada ? { ok: true } : { ok: false, motivo: "NO_ENCONTRADO" };
  } catch (error) {
    if (error instanceof RegionEnUsoError) {
      return { ok: false, motivo: "EN_USO" };
    }

    throw error;
  }
}
