import type { FormatoExcelResumen } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

// Etiqueta del formato de archivo en el filtro del listado de usuarios (`/dashboard/usuarios` y
// `/revisor/usuarios`). Se incluyen los inactivos marcados, mismo criterio que
// `opciones-establecimiento.ts`.
export function aOpcionesFormatoUsuario(formatos: FormatoExcelResumen[]): OpcionSelect[] {
  return formatos.map((formato) => ({
    valor: formato.id,
    etiqueta: `${formato.nombre}${formato.activo ? "" : " (inactivo)"}`,
  }));
}
