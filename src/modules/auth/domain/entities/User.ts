export type User = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  // `null` = cuenta pendiente de activación: se creó sin contraseña y no puede iniciar sesión
  // hasta fijarla con un enlace de un solo uso. Es la autoridad única del estado "pendiente".
  contrasenaHash: string | null;
  perfilCodigo: string;
  activo: boolean;
  createdAt: Date;
  // Invalidación de sesión: ver el comentario en `prisma/schema.prisma`, columna `sesionVersion`.
  sesionVersion: number;
  // Bloqueo progresivo por intentos fallidos de login (ver `DURACIONES_BLOQUEO_MINUTOS` abajo).
  intentosFallidos: number;
  bloqueadaHasta: Date | null;
  vecesBloqueada: number;
};

// Puerta del LOGIN. Una cuenta puede iniciar sesión solo si está activa Y ya tiene contraseña:
// una cuenta pendiente (hash nulo) existe, pero todavía no tiene credencial con qué entrar.
export function puedeIniciarSesion(
  usuario: Pick<User, "activo" | "contrasenaHash">,
): boolean {
  return usuario.activo && usuario.contrasenaHash !== null;
}

// Elegibilidad para RECIBIR o CONSUMIR un enlace de contraseña (activación o recuperación). Solo
// exige que la cuenta esté activa: una cuenta pendiente todavía no tiene contraseña, pero
// justamente el enlace es lo que le permitirá fijar la primera y activarse. Es deliberadamente
// más laxa que `puedeIniciarSesion`: si el enlace exigiera tener contraseña previa, una cuenta
// pendiente nunca podría activarse.
export function puedeRecibirEnlaceContrasena(usuario: Pick<User, "activo">): boolean {
  return usuario.activo;
}

// Máximo de intentos fallidos CONSECUTIVOS antes de activar un bloqueo (ver
// `registrarIntentoFallido` en `UserRepository`). El 4º intento fallido es el que bloquea.
export const MAXIMO_INTENTOS_LOGIN_FALLIDOS = 4;

// Duración de cada bloqueo sucesivo, indexada por `vecesBloqueada` (1er bloqueo → 1 minuto, 2º →
// 3 minutos, 3º → 5 minutos, 4º en adelante → 15 minutos, techo). `vecesBloqueada` es monotónico
// de por vida y nunca se resetea (ni con login exitoso ni con un desbloqueo manual), así que la
// progresión no vuelve a empezar de cero para una cuenta que ya fue bloqueada antes.
export const DURACIONES_BLOQUEO_MINUTOS: readonly number[] = [1, 3, 5, 15];

// Puerta de BLOQUEO. `bloqueadaHasta` nulo o ya vencido significa que la cuenta puede intentar
// iniciar sesión normalmente (aunque `intentosFallidos` no esté en 0: ese contador solo importa
// para decidir si ESTE intento activa un bloqueo nuevo, no para bloquear por sí mismo).
export function cuentaBloqueada(usuario: Pick<User, "bloqueadaHasta">, ahora: Date): boolean {
  return usuario.bloqueadaHasta !== null && usuario.bloqueadaHasta.getTime() > ahora.getTime();
}
