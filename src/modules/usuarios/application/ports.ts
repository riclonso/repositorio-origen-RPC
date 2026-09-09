// Interfaces técnicas del módulo. application/ nunca importa bcrypt ni ninguna librería
// de infraestructura: solo depende de estos puertos.
export interface HasheadorContrasena {
  hashear(contrasena: string): Promise<string>;
}
