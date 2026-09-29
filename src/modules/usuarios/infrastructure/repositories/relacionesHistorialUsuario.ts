import { Prisma } from "@prisma/client";

// FUENTE ÚNICA de "qué es historial" de una cuenta (RF-25). La usan `listar()` (combinadas con OR
// en la columna `tieneHistorial`) y `eliminar()` (por separado, para auditar cuáles bloquean) de
// `PrismaUsuarioRepository`. Prohibido duplicar esta lista en otro punto.
//
// Clasificación de TODAS las relaciones de lista del `model Usuario` de `prisma/schema.prisma`:
//  - HISTORIAL (10, todas `onDelete: Restrict`): hechos del sistema que una eliminación borraría o
//    dejaría huérfanos. Una sola fila en cualquiera impide eliminar; la FK Restrict es además la
//    defensa final de la base de datos.
//  - DESCARTABLES (2, `onDelete: Cascade`): material de la propia cuenta sin valor histórico
//    (tokens de recuperación, cuyo rastro de emisión ya está en `auditoria.txt`) o configuración
//    vigente (asignaciones de formatos, cuyos ids se auditan como `formatosQuitados`).
// `tests/relaciones-usuario.guard.unit.ts` compara esta clasificación contra el schema y falla si
// alguien agrega una relación nueva a `Usuario` sin clasificarla aquí.
//
// Cada fragmento referencia a la cuenta como `u."id"`: las consultas que los usan deben aliasar la
// tabla `usuario` como `u`. Son constantes del código, nunca se concatena input del usuario.
export type RelacionHistorialUsuario = {
  // Nombre de la relación inversa en `model Usuario` (identificador estable para auditoría).
  nombre: string;
  existe: Prisma.Sql;
};

export const RELACIONES_HISTORIAL_USUARIO: readonly RelacionHistorialUsuario[] = [
  {
    nombre: "cargasArchivo",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "carga_archivo" h WHERE h."usuarioId" = u."id")`,
  },
  {
    nombre: "cargasVistoBuenoPor",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "carga_archivo" h WHERE h."vistoBuenoPorId" = u."id")`,
  },
  {
    nombre: "publicacionesCargaCreadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "carga_archivo_publicada" h WHERE h."publicadoPorId" = u."id")`,
  },
  {
    nombre: "solicitudesReemplazoSolicitadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "solicitud_reemplazo_carga" h WHERE h."solicitadoPorId" = u."id")`,
  },
  {
    nombre: "solicitudesReemplazoRevisadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "solicitud_reemplazo_carga" h WHERE h."revisadoPorId" = u."id")`,
  },
  {
    nombre: "cargasRechazadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "carga_archivo_rechazo" h WHERE h."rechazadoPorId" = u."id")`,
  },
  {
    nombre: "ventanasCargaCreadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "ventana_carga" h WHERE h."creadoPorId" = u."id")`,
  },
  {
    nombre: "ventanasCargaEliminadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "ventana_carga" h WHERE h."eliminadaPorId" = u."id")`,
  },
  {
    // Por decisión de alcance: un correo de alerta realmente enviado a la persona es historial.
    nombre: "alertasRecibidas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "alerta_notificacion_ventana" h WHERE h."usuarioId" = u."id")`,
  },
  {
    nombre: "alertasDisparadas",
    existe: Prisma.sql`EXISTS (SELECT 1 FROM "alerta_notificacion_ventana" h WHERE h."disparadoPorId" = u."id")`,
  },
];

// Relaciones que se eliminan en cascada junto con la cuenta. Solo documental (y para la prueba de
// guardia): ninguna consulta las usa, las borra la regla `onDelete: Cascade` de la base.
export const RELACIONES_DESCARTABLES_USUARIO: readonly string[] = [
  "tokensRecuperacion",
  "formatosAsignados",
];

// `true` si la cuenta tiene al menos una fila en cualquier relación de historial.
export const EXPRESION_TIENE_HISTORIAL: Prisma.Sql = Prisma.sql`(${Prisma.join(
  RELACIONES_HISTORIAL_USUARIO.map((relacion) => relacion.existe),
  " OR ",
)})`;

// Arreglo `text[]` con los NOMBRES de las relaciones de historial que tienen filas (vacío si
// ninguna). Los nombres viajan como parámetros, no concatenados.
export const EXPRESION_RELACIONES_BLOQUEANTES: Prisma.Sql = Prisma.sql`array_remove(ARRAY[${Prisma.join(
  RELACIONES_HISTORIAL_USUARIO.map(
    (relacion) => Prisma.sql`CASE WHEN ${relacion.existe} THEN ${relacion.nombre}::text END`,
  ),
)}]::text[], NULL)`;
