import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

export type ResultadoCambiarPublicacionVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "VENTANA_ELIMINADA" };

// Publica/despublica una ventana de carga (RF-15 ampliación). Sin restricción de ownership: a
// diferencia de `eliminarVentanaCarga`, ADMIN y REVISOR_REPOSITORIO son simétricos aquí. No tiene
// sentido publicar (ni despublicar) una ventana ya eliminada.
export async function cambiarPublicacionVentanaCarga(
  id: string,
  publicada: boolean,
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<ResultadoCambiarPublicacionVentanaCarga> {
  const ventana = await dependencias.repositorio.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  if (ventana.eliminadaEn !== null) {
    return { ok: false, motivo: "VENTANA_ELIMINADA" };
  }

  const actualizada = await dependencias.repositorio.cambiarPublicacion(id, publicada);

  if (!actualizada) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  return { ok: true, ventana: actualizada };
}
