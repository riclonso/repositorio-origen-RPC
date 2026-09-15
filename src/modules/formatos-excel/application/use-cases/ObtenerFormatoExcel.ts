import type { FormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

export function obtenerFormatoExcel(
  id: string,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<FormatoExcel | null> {
  return dependencias.repositorio.obtenerPorId(id);
}
