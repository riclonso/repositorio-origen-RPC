import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoCambiarEstadoFormatoExcel =
  | { ok: true; formato: FormatoExcel }
  | { ok: false; motivo: "NO_ENCONTRADO" };

// A diferencia de `cambiarEstadoUsuario`, no hay reglas anti-autobloqueo que aplicar: un formato
// con usuarios asignados puede desactivarse igual (mismo criterio que `Perfil.activo`). Los
// usuarios que ya lo tienen lo conservan; solo deja de poder asignarse a nuevos.
export async function cambiarEstadoFormatoExcel(
  id: string,
  activo: boolean,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoCambiarEstadoFormatoExcel> {
  const actual = await dependencias.repositorio.obtenerPorId(id);

  if (!actual) {
    return { ok: false, motivo: "NO_ENCONTRADO" };
  }

  const formato = await dependencias.repositorio.cambiarEstado(id, activo);
  return { ok: true, formato };
}
