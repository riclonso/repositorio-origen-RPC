export type Rol = "ADMIN" | "USUARIO";

export type User = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  contrasenaHash: string;
  rol: Rol;
  activo: boolean;
  createdAt: Date;
};

export function puedeIniciarSesion(usuario: Pick<User, "activo">): boolean {
  return usuario.activo;
}
