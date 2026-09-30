// Traducción a dominio de la violación de una clave foránea al eliminar una comuna (P2003 en
// Prisma). Hoy ninguna tabla referencia a `comuna`; es una defensa para cuando alguna lo haga, de
// modo que el borde responda 409 y no un 500.
export class ComunaEnUsoError extends Error {
  constructor() {
    super("La comuna está en uso y no puede eliminarse");
    this.name = "ComunaEnUsoError";
  }
}
