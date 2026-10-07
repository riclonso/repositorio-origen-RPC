// Este archivo lo importan `src/proxy.ts` y `JwtService.ts`, que se empaquetan dentro del proxy.
// Se mantiene como TypeScript puro (sin Prisma, sin `node:*`, sin Zod) para que la capa de dominio
// no arrastre infraestructura, no porque el proxy corra en Edge: en Next 16 el Proxy usa el runtime
// Node.js por defecto y la opción `runtime` ni siquiera está disponible ahí
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).

export type Perfil = {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
};

// Único código privilegiado que el sistema conoce por su nombre. Los permisos configurables por
// perfil están fuera de alcance: insertar una fila en `perfil` crea un perfil ASIGNABLE, no un
// perfil con permisos propios.
export const CODIGO_PERFIL_ADMIN = "ADMIN";

export function esPerfilAdministrador(codigo: string): boolean {
  return codigo === CODIGO_PERFIL_ADMIN;
}

// Perfil de quien notifica casos al Registro Poblacional de Cáncer. Igual que `CODIGO_PERFIL_ADMIN`,
// es un código que el sistema conoce por su nombre porque tiene un área propia (`/notificador`); no
// se hace un genérico `tieneCodigoPerfil` porque cada área mapea 1:1 a un perfil conocido y un
// helper genérico invitaría a saltarse ese mapeo explícito.
export const CODIGO_PERFIL_NOTIFICADOR = "NOTIFICADOR_RPC";

export function esPerfilNotificador(codigo: string): boolean {
  return codigo === CODIGO_PERFIL_NOTIFICADOR;
}

// Perfil de quien revisa las cargas de archivo ya aprobadas por un notificador (RF-14). Mismo
// criterio que `CODIGO_PERFIL_NOTIFICADOR`: tiene área propia (`/revisor`), así que el sistema lo
// conoce por su código.
export const CODIGO_PERFIL_REVISOR_REPOSITORIO = "REVISOR_REPOSITORIO";

export function esPerfilRevisorRepositorio(codigo: string): boolean {
  return codigo === CODIGO_PERFIL_REVISOR_REPOSITORIO;
}

// RF-37: perfil que reporta los archivos de Defunciones y Egresos por año. Tiene área propia
// (`/bioestadistica`), así que el sistema lo conoce por su código, mismo criterio que los anteriores.
export const CODIGO_PERFIL_BIOESTADISTICA = "BIOESTADISTICA";

export function esPerfilBioestadistica(codigo: string): boolean {
  return codigo === CODIGO_PERFIL_BIOESTADISTICA;
}

// RF-30 / RF-37: perfiles que DEBEN pertenecer a un establecimiento (el notificador y, desde RF-37,
// Bioestadística, cuyas cargas guardan una copia del establecimiento). Para el resto es opcional.
// Fuente única para el esquema Zod, el caso de uso y el formulario.
export function perfilExigeEstablecimiento(codigo: string): boolean {
  return esPerfilNotificador(codigo) || esPerfilBioestadistica(codigo);
}

// Perfiles cuyas cuentas puede ver y administrar un REVISOR_REPOSITORIO desde su mantenedor de
// usuarios (todo menos ADMIN). Fuente única para el listado de la vista y el de la API.
export const PERFILES_GESTIONABLES_POR_REVISOR: readonly string[] = [
  CODIGO_PERFIL_NOTIFICADOR,
  CODIGO_PERFIL_REVISOR_REPOSITORIO,
  CODIGO_PERFIL_BIOESTADISTICA,
];

// Forma válida de un código de perfil. Vive aquí, en TypeScript puro, porque la usan tanto el
// esquema Zod como la verificación del JWT: una sola definición impide que las dos deriven.
export const FORMA_CODIGO_PERFIL = /^[A-Z][A-Z0-9_]{0,39}$/;
