import type { FiltroListadoEstablecimientos } from "@/modules/establecimiento/domain/entities/Establecimiento";
import { FILTRO_LISTADO_POR_DEFECTO } from "@/modules/establecimiento/schemas/listado-establecimientos.schema";

export const RUTA_ESTABLECIMIENTOS = "/dashboard/establecimientos";

// Construye la URL del listado conservando el filtro vigente y reemplazando solo la página. Se
// parte del filtro ya validado para no arrastrar parámetros inválidos escritos a mano.
export function construirRutaEstablecimientos(
  filtro: FiltroListadoEstablecimientos,
  pagina: number = filtro.pagina,
): string {
  const parametros = new URLSearchParams();

  if (filtro.termino) parametros.set("q", filtro.termino);
  if (filtro.tipo) parametros.set("tipo", filtro.tipo);
  if (filtro.activo !== undefined) parametros.set("activo", String(filtro.activo));
  if (filtro.tamano !== FILTRO_LISTADO_POR_DEFECTO.tamano) {
    parametros.set("tamano", String(filtro.tamano));
  }
  if (pagina > FILTRO_LISTADO_POR_DEFECTO.pagina) {
    parametros.set("pagina", String(pagina));
  }

  const consulta = parametros.toString();
  return consulta ? `${RUTA_ESTABLECIMIENTOS}?${consulta}` : RUTA_ESTABLECIMIENTOS;
}
