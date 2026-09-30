// Traducción a dominio de la violación de clave foránea contra `establecimiento` al escribir
// `usuario.establecimientoId` (P2003 en Prisma), RF-30. Mismo rol que `PerfilInvalidoError`: permite
// que `application/` reaccione a un establecimiento inexistente sin conocer los códigos del ORM, y
// que el borde responda 400 en vez de un 500 por error de base de datos.
export class EstablecimientoInvalidoError extends Error {
  constructor() {
    super("El establecimiento indicado no existe");
    this.name = "EstablecimientoInvalidoError";
  }
}
