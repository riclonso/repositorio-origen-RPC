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
  // Bloqueo progresivo por intentos fallidos de login (ver `DURACIONES_BLOQUEO_MINUTOS` en
  // `modules/auth/domain/entities/User.ts`, misma semántica). `null` = sin bloqueo vigente.
  bloqueadaHasta: Date | null;
  // Cuántas veces la cuenta ha sido bloqueada en toda su historia (monotónico, nunca se
  // resetea). Se expone en el mantenedor como indicador junto al chip "Bloqueada"; no participa
  // en ninguna regla de `application/` de este módulo (la usa `modules/auth/` para decidir la
  // duración del próximo bloqueo).
  vecesBloqueada: number;
};

// Tipo DELIBERADAMENTE separado de `Usuario`: es el único punto de `modules/usuarios/` que expone
// el hash de la contraseña, y solo lo usa `cambiarContrasenaPropia` para verificar la actual. No
// extiende ni se mezcla con `Usuario` para que el compilador siga impidiendo que el hash se
// filtre por accidente a cualquier código que trabaje con el tipo `Usuario` normal.
export type CredencialUsuario = { id: string; contrasenaHash: string | null };

// Puerta de BLOQUEO, mismo criterio que `cuentaBloqueada` en `modules/auth/domain/entities/User.ts`
// (ambos módulos representan la misma columna, pero cada uno con su propio tipo de dominio).
export function estaBloqueada(usuario: Pick<Usuario, "bloqueadaHasta">, ahora: Date): boolean {
  return usuario.bloqueadaHasta !== null && usuario.bloqueadaHasta.getTime() > ahora.getTime();
}

// Al crear, la cuenta nace SIN contraseña (pendiente de activación): `contrasenaHash` es `null`
// y la persona la fija por enlace. `tieneContrasena` se deriva del hash (se omite). Los formatos
// se asignan por sus ids (N:M), no como objetos; solo tienen sentido para NOTIFICADOR_RPC.
export type DatosNuevoUsuario = Omit<
  Usuario,
  | "id"
  | "createdAt"
  | "perfilNombre"
  | "tieneContrasena"
  | "formatosExcel"
  | "bloqueadaHasta"
  | "vecesBloqueada"
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
  // Restricción aplicada por el servidor según el perfil del actor. No llega desde la URL ni se
  // expone en el formulario: limita a REVISOR_REPOSITORIO a los perfiles expresamente permitidos,
  // incluso si el catálogo suma perfiles nuevos en el futuro.
  perfilesPermitidos?: readonly string[];
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
