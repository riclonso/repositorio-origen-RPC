// Traducción a dominio de la violación de la restricción UNIQUE sobre `nombreNormalizado`
// (P2002 en Prisma). Permite que application/ reaccione a un duplicado sin conocer los códigos
// de error del ORM.
export class TipoEstablecimientoDuplicadoError extends Error {
  constructor() {
    super("Ya existe un tipo con ese nombre");
    this.name = "TipoEstablecimientoDuplicadoError";
  }
}
