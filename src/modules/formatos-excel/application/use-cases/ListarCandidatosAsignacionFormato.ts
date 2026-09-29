import type { CandidatoAsignacionFormato } from "@/modules/formatos-excel/domain/entities/AsignacionFormato";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export type ResultadoListarCandidatosAsignacion =
  | { ok: true; candidatos: CandidatoAsignacionFormato[] }
  | { ok: false; motivo: "NO_ENCONTRADO" };

export async function listarCandidatosAsignacionFormato(
  id: string,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<ResultadoListarCandidatosAsignacion> {
  const candidatos = await dependencias.repositorio.listarCandidatosAsignacion(id);
  if (!candidatos) return { ok: false, motivo: "NO_ENCONTRADO" };
  return { ok: true, candidatos };
}
