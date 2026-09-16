// Traducción a dominio de la violación de clave foránea contra `tipo_establecimiento` (P2003 en
// Prisma). Permite que application/ reaccione a un tipo inexistente sin conocer los códigos del
// ORM, y que el borde responda 400 sobre el campo en vez de un 500 por error de base de datos.
export class TipoInvalidoError extends Error {
  readonly tipoId: string;

  constructor(tipoId: string) {
    super("El tipo de establecimiento indicado no existe");
    this.name = "TipoInvalidoError";
    this.tipoId = tipoId;
  }
}
