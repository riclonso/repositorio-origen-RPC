import type { Establecimiento } from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { EstablecimientoRepository } from "@/modules/establecimiento/domain/repositories/EstablecimientoRepository";

export type ResultadoCambiarEstadoEstablecimiento =
  | { ok: true; establecimiento: Establecimiento }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// La baja es lógica (`activo = false`), nunca borrado físico: preserva la trazabilidad. No hay
// reglas anti-autobloqueo (un establecimiento no es una cuenta que pueda dejarse fuera a sí
// misma). La regla vive aquí aunque hoy solo delegue, para que cualquier restricción futura nazca
// en la capa de aplicación y no en la UI.
export async function cambiarEstadoEstablecimiento(
  id: string,
  activo: boolean,
  dependencias: { repositorio: EstablecimientoRepository },
): Promise<ResultadoCambiarEstadoEstablecimiento> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const establecimiento = await dependencias.repositorio.cambiarEstado(id, activo);
  return { ok: true, establecimiento };
}
