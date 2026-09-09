export type RolUsuario = "ADMIN" | "USUARIO";

export type Usuario = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  email: string;
  username: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt: Date;
};
