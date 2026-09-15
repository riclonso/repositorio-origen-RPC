import type { VentanaCargaRepository, TipoEliminacionVentanaCarga } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";
import { esPerfilAdministrador } from "@/modules/perfiles/domain/entities/Perfil";

export type ResultadoEliminarVentanaCarga =
  | { ok: true; tipo: TipoEliminacionVentanaCarga; anio: number }
  | { ok: false; motivo: "VENTANA_NO_ENCONTRADA" }
  | { ok: false; motivo: "SIN_PERMISO" };

// ADMIN puede eliminar cualquier ventana; REVISOR_REPOSITORIO solo las que él mismo creó —
// decisión explícita del usuario, la única asimetría de RF-15 entre ambos perfiles (crear y
// editar fechas siguen sin restricción de ownership). La decisión hard/soft (¿tiene cargas
// asociadas?) la resuelve el repositorio contra el `ON DELETE RESTRICT` real, no un conteo aquí.
export async function eliminarVentanaCarga(
  id: string,
  actor: { id: string; perfil: string },
  dependencias: { repositorio: VentanaCargaRepository },
): Promise<ResultadoEliminarVentanaCarga> {
  const ventana = await dependencias.repositorio.obtenerPorId(id);

  if (!ventana) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  if (!esPerfilAdministrador(actor.perfil) && ventana.creadoPorId !== actor.id) {
    return { ok: false, motivo: "SIN_PERMISO" };
  }

  const resultado = await dependencias.repositorio.eliminar(id, actor.id);

  if (!resultado) {
    return { ok: false, motivo: "VENTANA_NO_ENCONTRADA" };
  }

  return { ok: true, tipo: resultado.tipo, anio: ventana.anio };
}
