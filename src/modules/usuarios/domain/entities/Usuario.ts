export type RolUsuario = "ADMIN" | "USUARIO";

// Nota: `Usuario` no incluye `contrasenaHash` a propósito. Al ser el tipo que viaja desde el
// repositorio hasta la respuesta HTTP, dejar fuera el hash hace imposible filtrarlo por descuido.
export type Usuario = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt: Date;
};

export type DatosNuevoUsuario = Omit<Usuario, "id" | "createdAt"> & {
  contrasenaHash: string;
};

export type DatosEdicionUsuario = Pick<Usuario, "nombres" | "apellidos" | "email" | "rol">;

// Campos con restricción UNIQUE en la tabla `usuario`.
export type CampoUnico = "rut" | "email" | "username";

export type FiltroListadoUsuarios = {
  termino?: string;
  rol?: RolUsuario;
  activo?: boolean;
  pagina: number;
  tamano: number;
};

export type PaginaUsuarios = {
  filas: Usuario[];
  total: number;
};

// Reglas puras de dominio (sin I/O).

export function esAutoOperacion(actorId: string, objetivoId: string): boolean {
  return actorId === objetivoId;
}

export function nombreCompleto(usuario: Pick<Usuario, "nombres" | "apellidos">): string {
  return `${usuario.nombres} ${usuario.apellidos}`.trim();
}
