import type { ComunaRepository } from "@/modules/comunas/domain/repositories/ComunaRepository";
import { ComunaEnUsoError } from "@/modules/comunas/domain/errors/ComunaEnUsoError";

export type ResultadoEliminarComuna =
  // `provinciaId` de la comuna borrada, para auditarlo (la fila ya no existe).
  | { ok: true; provinciaId: string }
  | { ok: false; motivo: "NO_ENCONTRADO" }
  | { ok: false; motivo: "EN_USO" };

// Eliminación FÍSICA (la comuna no tiene `activo`). Hoy nada referencia a `comuna`; si en el futuro
// alguna tabla lo hace con FK `Restrict`, la base corta el DELETE y aquí se traduce a `EN_USO` en
// vez de propagarse como un error técnico.
export async function eliminarComuna(
  id: string,
  dependencias: { repositorio: ComunaRepository },
): Promise<ResultadoEliminarComuna> {
  try {
    const eliminada = await dependencias.repositorio.eliminar(id);
    return eliminada
      ? { ok: true, provinciaId: eliminada.provinciaId }
      : { ok: false, motivo: "NO_ENCONTRADO" };
  } catch (error) {
    if (error instanceof ComunaEnUsoError) {
      return { ok: false, motivo: "EN_USO" };
    }

    throw error;
  }
}
