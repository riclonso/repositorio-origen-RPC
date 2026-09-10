// Traducción a dominio de la violación de clave foránea contra `perfil` (P2003 en Prisma).
// Permite que application/ reaccione a un perfil inexistente sin conocer los códigos del ORM,
// y que el borde responda 400 en vez de un 500 por error de base de datos.
export class PerfilInvalidoError extends Error {
  readonly perfilCodigo: string;

  constructor(perfilCodigo: string) {
    super("El perfil indicado no existe");
    this.name = "PerfilInvalidoError";
    this.perfilCodigo = perfilCodigo;
  }
}
