import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { TipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/domain/repositories/TipoEstablecimientoRepository";

export type ResultadoCambiarEstadoTipo =
  | { ok: true; tipo: TipoEstablecimiento }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// Desactivar un tipo con establecimientos asociados SE PERMITE: `activo` gobierna la
// asignabilidad (sale del selector para nuevos), no la autorización, e igual que `perfil.activo`
// no toca los establecimientos que ya lo usan. La regla vive aquí aunque hoy solo delegue, para
// que cualquier restricción futura al cambio de estado nazca en la capa de aplicación y no en la
// UI, donde se saltaría llamando la API a mano.
export async function cambiarEstadoTipoEstablecimiento(
  id: string,
  activo: boolean,
  dependencias: { repositorio: TipoEstablecimientoRepository },
): Promise<ResultadoCambiarEstadoTipo> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const tipo = await dependencias.repositorio.cambiarEstado(id, activo);
  return { ok: true, tipo };
}
