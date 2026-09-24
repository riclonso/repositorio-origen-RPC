// Interfaces técnicas del módulo. application/ nunca importa bcrypt ni ninguna librería
// de infraestructura: solo depende de estos puertos.
export interface HasheadorContrasena {
  hashear(contrasena: string): Promise<string>;
}

// Usado por `cambiarContrasenaPropia` para comparar la contraseña actual contra el hash
// almacenado, antes de aceptar el cambio.
export interface VerificadorContrasena {
  verificar(contrasena: string, hash: string): Promise<boolean>;
}
