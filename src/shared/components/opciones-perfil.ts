import type { Perfil } from "@/modules/perfiles/domain/entities/Perfil";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

// Traduce el catálogo a opciones de select conservando el orden que ya trae el repositorio.
// Vive aquí y no en cada pantalla para que el listado, el alta y la edición muestren siempre
// las mismas etiquetas, tanto en `/dashboard/usuarios` (ADMIN) como en `/revisor/usuarios`
// (REVISOR_REPOSITORIO).
export function aOpcionesPerfil(perfiles: Perfil[]): OpcionSelect[] {
  return perfiles.map((perfil) => ({ valor: perfil.codigo, etiqueta: perfil.nombre }));
}
