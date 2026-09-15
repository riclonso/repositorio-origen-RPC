import type { PlantillaFormatoExcel } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";

// Único caso de uso del módulo que expone el binario de la plantilla. Lo invoca exclusivamente
// el endpoint de descarga.
export function obtenerPlantillaFormatoExcel(
  id: string,
  dependencias: { repositorio: FormatoExcelRepository },
): Promise<PlantillaFormatoExcel | null> {
  return dependencias.repositorio.obtenerPlantilla(id);
}
