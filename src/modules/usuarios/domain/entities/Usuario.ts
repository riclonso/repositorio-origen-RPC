// Nota: `Usuario` no incluye `contrasenaHash` a propósito. Al ser el tipo que viaja desde el
// repositorio hasta la respuesta HTTP, dejar fuera el hash hace imposible filtrarlo por descuido.
//
// El perfil viaja en dos campos PLANOS y no como objeto anidado: `perfilCodigo` es el
// identificador estable con el que operan las reglas y la auditoría, `perfilNombre` es la
// etiqueta que se muestra y que el mantenedor de perfiles podrá cambiar sin romper nada.
export type Usuario = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  perfilCodigo: string;
  perfilNombre: string;
  activo: boolean;
  createdAt: Date;
};

export type DatosNuevoUsuario = Omit<Usuario, "id" | "createdAt" | "perfilNombre"> & {
  contrasenaHash: string;
};

export type DatosEdicionUsuario = Pick<
  Usuario,
  "nombres" | "apellidos" | "email" | "perfilCodigo"
>;

// Campos con restricción UNIQUE en la tabla `usuario`.
export type CampoUnico = "rut" | "email" | "username";

export type FiltroListadoUsuarios = {
  termino?: string;
  perfil?: string;
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
