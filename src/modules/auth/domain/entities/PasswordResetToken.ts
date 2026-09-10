// Token de recuperación de contraseña (RF-10).
//
// La entidad NO tiene campo `tokenHash`, por el mismo motivo por el que
// `modules/usuarios/domain/entities/Usuario.ts` no incluye `contrasenaHash`: el hash entra al
// repositorio como argumento y nunca vuelve. El token en claro no aparece aquí en ninguna
// forma; existe solo en memoria durante la petición que lo emite y dentro del correo enviado.
export type PasswordResetToken = {
  id: string;
  usuarioId: string;
  expiraEn: Date;
  usadoEn: Date | null;
  invalidadoEn: Date | null;
  createdAt: Date;
};

// Vigencia del enlace. Suficiente para abrir el correo en el teléfono o el escritorio, y acotada
// para un secreto que queda escrito en un buzón.
export const HORAS_VIGENCIA_TOKEN = 2;

// Cupo por cuenta: es el límite que de verdad protege una casilla del bombardeo, porque acota
// cuántos correos se le pueden mandar a una persona sin importar desde cuántas IPs se pida.
// Máximo 3 solicitudes por cada ventana de 15 minutos, para no saturar la casilla ni el relay
// institucional (evitar que la reputación del remitente caiga en listas negras).
export const MAXIMO_SOLICITUDES_POR_CUENTA = 3;
export const VENTANA_SOLICITUDES_MINUTOS = 15;

// Retención de filas ya inertes. La purga es oportunista y acotada al usuario que solicita, no
// un cron: siete días dan margen de sobra al soporte y el historial del evento vive de todas
// formas en `logs/auditoria.txt`.
export const DIAS_RETENCION_TOKEN = 7;

// 256 bits de un CSPRNG. Vive en `domain/` y no en `TokenService.ts` porque el esquema Zod
// deriva de aquí el largo esperado del token y lo importan Client Components: TokenService usa
// `node:crypto` y no puede entrar al bundle del navegador. Mismo precedente que
// `FORMA_CODIGO_PERFIL` en `modules/perfiles/domain/entities/Perfil.ts`.
export const BYTES_TOKEN_RECUPERACION = 32;

// base64url da 43 caracteres seguros en URL sin escapado, contra los 64 de hexadecimal. Menos
// caracteres significa menos probabilidad de que un cliente de correo parta la línea del enlace,
// que es un modo de fallo real.
export const LARGO_TOKEN_RECUPERACION = Math.ceil((BYTES_TOKEN_RECUPERACION * 4) / 3);

const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;

export function calcularVencimiento(desde: Date): Date {
  return new Date(desde.getTime() + HORAS_VIGENCIA_TOKEN * MILISEGUNDOS_POR_HORA);
}

// Regla pura. El consumo real no la usa para decidir: lo hace PostgreSQL en una única sentencia
// condicional, para que dos peticiones simultáneas no puedan reclamar el mismo token. Queda
// disponible para lecturas de solo consulta.
export function estaVigente(token: PasswordResetToken, ahora: Date): boolean {
  return token.usadoEn === null && token.invalidadoEn === null && token.expiraEn > ahora;
}
