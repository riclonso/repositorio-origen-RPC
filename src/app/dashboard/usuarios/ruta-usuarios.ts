import type { FiltroListadoUsuarios } from "@/modules/usuarios/domain/entities/Usuario";
import { FILTRO_LISTADO_POR_DEFECTO } from "@/modules/usuarios/schemas/listado-usuarios.schema";

export const RUTA_USUARIOS = "/dashboard/usuarios";

// Construye la URL del listado conservando el filtro vigente y reemplazando solo la página.
// Se parte del filtro ya validado para no arrastrar parámetros inválidos escritos a mano.
export function construirRutaUsuarios(
  filtro: FiltroListadoUsuarios,
  pagina: number = filtro.pagina,
): string {
  const parametros = new URLSearchParams();

  if (filtro.termino) parametros.set("q", filtro.termino);
  if (filtro.rol) parametros.set("rol", filtro.rol);
  if (filtro.activo !== undefined) parametros.set("activo", String(filtro.activo));
  if (filtro.tamano !== FILTRO_LISTADO_POR_DEFECTO.tamano) {
    parametros.set("tamano", String(filtro.tamano));
  }
  if (pagina > FILTRO_LISTADO_POR_DEFECTO.pagina) {
    parametros.set("pagina", String(pagina));
  }

  const consulta = parametros.toString();
  return consulta ? `${RUTA_USUARIOS}?${consulta}` : RUTA_USUARIOS;
}
