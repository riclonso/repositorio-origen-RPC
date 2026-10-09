import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

// Traduce el catálogo de tipos a opciones de select conservando el orden que trae el repositorio.
// Vive aquí y no en cada pantalla para que el listado, el alta y la edición muestren siempre las
// mismas etiquetas.
export function aOpcionesTipo(tipos: TipoEstablecimiento[]): OpcionSelect[] {
  return tipos.map((tipo) => ({ valor: tipo.id, etiqueta: tipo.nombre }));
}
