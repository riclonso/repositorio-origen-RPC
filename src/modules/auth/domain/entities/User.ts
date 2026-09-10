export type User = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  contrasenaHash: string;
  perfilCodigo: string;
  activo: boolean;
  createdAt: Date;
};

export function puedeIniciarSesion(usuario: Pick<User, "activo">): boolean {
  return usuario.activo;
}
