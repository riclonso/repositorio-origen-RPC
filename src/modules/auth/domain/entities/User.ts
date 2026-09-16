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
