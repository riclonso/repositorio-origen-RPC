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

// Forma válida de un código de perfil. Vive aquí, en TypeScript puro, porque la usan tanto el
// esquema Zod como la verificación del JWT: una sola definición impide que las dos deriven.
export const FORMA_CODIGO_PERFIL = /^[A-Z][A-Z0-9_]{0,39}$/;
