import type { Perfil } from "@/modules/perfiles/domain/entities/Perfil";

export type OpcionesListadoPerfiles = {
  soloActivos?: boolean;
  // Códigos que se incluyen aunque estén inactivos. Lo necesita el formulario de edición: si el
  // perfil vigente de la persona fue dado de baja y no aparece en el select, el navegador
  // seleccionaría otra opción y guardar cambiaría su perfil en silencio.
  incluirCodigos?: string[];
};

export interface PerfilRepository {
  listar(opciones?: OpcionesListadoPerfiles): Promise<Perfil[]>;
  existeActivo(codigo: string): Promise<boolean>;
  // Un perfil por su código, activo o no: se usa para mostrar el nombre visible del perfil de la
  // sesión en el encabezado. No filtra por `activo` porque la persona conserva su perfil aunque el
  // catálogo lo haya dado de baja, y su nombre debe seguir siendo legible.
  buscarPorCodigo(codigo: string): Promise<Perfil | null>;
}
