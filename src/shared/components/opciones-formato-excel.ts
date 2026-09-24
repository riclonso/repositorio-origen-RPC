import type { FormatoExcelResumen } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { OpcionSeleccionMultiple } from "@/shared/components/CampoSeleccionMultiple";

// Formatos activos + los que la persona ya tuviera asignados, aunque hayan sido dados de baja.
// Mismo criterio que `aOpcionesPerfil`/`incluirCodigos`: sin esto, editar a alguien con un
// formato inactivo se lo quitaría en silencio al guardar (el checkbox nunca aparecería marcado).
export function aOpcionesFormatoExcel(
  formatos: FormatoExcelResumen[],
  idsAsignados: string[] = [],
): OpcionSeleccionMultiple[] {
  return formatos
    .filter((formato) => formato.activo || idsAsignados.includes(formato.id))
    .map((formato) => ({ valor: formato.id, etiqueta: formato.nombre }));
}
