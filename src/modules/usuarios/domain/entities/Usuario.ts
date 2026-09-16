// Nota: `Usuario` no incluye `contrasenaHash` a propósito. Al ser el tipo que viaja desde el
// repositorio hasta la respuesta HTTP, dejar fuera el hash hace imposible filtrarlo por descuido.
//
// El perfil viaja en dos campos PLANOS y no como objeto anidado: `perfilCodigo` es el
// identificador estable con el que operan las reglas y la auditoría, `perfilNombre` es la
// etiqueta que se muestra y que el mantenedor de perfiles podrá cambiar sin romper nada.
export type FormatoExcelAsignado = { id: string; nombre: string };

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
  // `true` = la cuenta ya tiene contraseña; `false` = pendiente de activación. Se deriva de si
  // `contrasenaHash` es nulo SIN exponer el hash: el hash nunca sale del repositorio (misma
  // razón por la que `Usuario` no lo declara). Es lo que el mantenedor usa para el chip
  // "Pendiente de activación" y para decidir entre "enviar" y "reenviar" el enlace.
  tieneContrasena: boolean;
  createdAt: Date;
  // Formatos de archivo asignados (N:M vía `usuario_formato_excel`). Solo tiene sentido para el
  // perfil NOTIFICADOR_RPC; para cualquier otro perfil queda vacío.
  formatosExcel: FormatoExcelAsignado[];
};

// Al crear, la cuenta nace SIN contraseña (pendiente de activación): `contrasenaHash` es `null`
// y la persona la fija por enlace. `tieneContrasena` se deriva del hash (se omite). Los formatos
// se asignan por sus ids (N:M), no como objetos; solo tienen sentido para NOTIFICADOR_RPC.
export type DatosNuevoUsuario = Omit<
  Usuario,
  "id" | "createdAt" | "perfilNombre" | "tieneContrasena" | "formatosExcel"
> & {
  contrasenaHash: string | null;
  formatosExcelIds: string[];
};

export type DatosEdicionUsuario = Pick<
  Usuario,
  "nombres" | "apellidos" | "email" | "perfilCodigo"
> & { formatosExcelIds: string[] };

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
