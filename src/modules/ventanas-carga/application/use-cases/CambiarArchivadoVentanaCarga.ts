import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import type { VentanaCarga } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";
import { publicacionResultanteAlArchivar } from "@/modules/ventanas-carga/domain/entities/VentanaCarga";

export type ResultadoCambiarArchivadoVentanaCarga =
  | { ok: true; ventana: VentanaCarga }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" };

// Archiva/desarchiva una ventana de carga. Sin restricción de estado previo (ni ownership): a
// diferencia de `eliminarVentanaCarga`, ADMIN y REVISOR_REPOSITORIO son simétricos aquí, y no hay
// ninguna condición que impida archivar una ventana en cualquier estado (abierta/cerrada,
// publicada/borrador, eliminada o no). Archivar apaga siempre la publicación en la misma
// escritura (`publicacionResultanteAlArchivar`); desarchivar deja la publicación como estaba.
export async function cambiarArchivadoVentanaCarga(
  id: string,
  archivada: boolean,
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<ResultadoCambiarArchivadoVentanaCarga> {
  const ventana = await dependencias.repositorio.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  const publicada = publicacionResultanteAlArchivar(ventana.publicada, archivada);
  const actualizada = await dependencias.repositorio.cambiarArchivado(id, { archivada, publicada });

  if (!actualizada) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  return { ok: true, ventana: actualizada };
}
