import type { Perfil } from "@/modules/perfiles/domain/entities/Perfil";
import type {
  OpcionesListadoPerfiles,
  PerfilRepository,
} from "@/modules/perfiles/domain/repositories/PerfilRepository";

// El listado ya llega ordenado por `orden` y luego por `nombre` desde el repositorio: el orden
// es un dato del catálogo, no una preferencia de la pantalla que lo muestra.
export async function listarPerfiles(
  opciones: OpcionesListadoPerfiles,
  dependencias: { repositorio: PerfilRepository },
): Promise<Perfil[]> {
  return dependencias.repositorio.listar(opciones);
}
