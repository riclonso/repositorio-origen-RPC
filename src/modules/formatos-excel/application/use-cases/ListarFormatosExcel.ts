import type { FormatoExcelResumen } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

// Sin paginación de servidor (decisión ya tomada): el catálogo de formatos es de administración,
// no un padrón de personas, y no se espera que crezca al punto de necesitarla.
export function listarFormatosExcel(dependencias: {
  repositorio: FormatoExcelRepository;
}): Promise<FormatoExcelResumen[]> {
  return dependencias.repositorio.listar();
}
