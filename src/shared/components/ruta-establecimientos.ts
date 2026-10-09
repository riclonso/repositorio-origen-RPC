import type { FiltroListadoEstablecimientos } from "@/modules/establecimiento/domain/entities/Establecimiento";
import { FILTRO_LISTADO_POR_DEFECTO } from "@/modules/establecimiento/schemas/listado-establecimientos.schema";

// Bases de ruta de los mantenedores de establecimientos y tipos. Las pantallas se comparten entre
// `/dashboard` (ADMIN) y `/revisor` (REVISOR_REPOSITORIO), así que ningún componente asume una de
// las dos: cada área pasa su `rutaBase` (mismo criterio que `TablaFormatosExcel`).
export const RUTA_ESTABLECIMIENTOS_DASHBOARD = "/dashboard/establecimientos";
export const RUTA_ESTABLECIMIENTOS_REVISOR = "/revisor/establecimientos";
export const RUTA_TIPOS_ESTABLECIMIENTO_DASHBOARD = "/dashboard/tipos-establecimiento";
export const RUTA_TIPOS_ESTABLECIMIENTO_REVISOR = "/revisor/tipos-establecimiento";

// Construye la URL del listado conservando el filtro vigente y reemplazando solo la página. Se
// parte del filtro ya validado para no arrastrar parámetros inválidos escritos a mano.
export function construirRutaEstablecimientos(
  rutaBase: string,
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
  return consulta ? `${rutaBase}?${consulta}` : rutaBase;
}
