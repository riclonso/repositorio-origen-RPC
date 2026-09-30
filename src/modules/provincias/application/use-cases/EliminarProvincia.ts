import type { ProvinciaRepository } from "@/modules/provincias/domain/repositories/ProvinciaRepository";
import { ProvinciaEnUsoError } from "@/modules/provincias/domain/errors/ProvinciaEnUsoError";

export type ResultadoEliminarProvincia =
  // `regionId` de la provincia borrada, para auditarlo (la fila ya no existe).
  | { ok: true; regionId: string }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "EN_USO" };

// Eliminación FÍSICA (la provincia no tiene `activo`). Desde RF-28 `comuna` referencia a
// `provincia` con FK `Restrict`: la base corta el DELETE de una provincia con comunas y aquí se
// traduce a `EN_USO` en vez de propagarse como un error técnico.
export async function eliminarProvincia(
  id: string,
  dependencias: { repositorio: ProvinciaRepository },
): Promise<ResultadoEliminarProvincia> {
  try {
    const eliminada = await dependencias.repositorio.eliminar(id);
    return eliminada
      ? { ok: true, regionId: eliminada.regionId }
      : { ok: false, motivo: "NO_ENCONTRADO" };
  } catch (error) {
    if (error instanceof ProvinciaEnUsoError) {
      return { ok: false, motivo: "EN_USO" };
    }

    throw error;
  }
}
