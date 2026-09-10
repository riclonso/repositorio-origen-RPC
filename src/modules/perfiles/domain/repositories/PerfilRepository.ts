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
}
