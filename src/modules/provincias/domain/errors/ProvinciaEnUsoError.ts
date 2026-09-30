// Traducción a dominio de la violación de una clave foránea al eliminar una provincia (P2003 en
// Prisma). Desde RF-28 la referencia `comuna.provinciaId` (ON DELETE RESTRICT) corta el DELETE de
// una provincia con comunas; el borde responde 409 y no un 500. Cubre también cualquier tabla que
// en el futuro referencie a `provincia` con `Restrict`.
export class ProvinciaEnUsoError extends Error {
  constructor() {
    super("La provincia está en uso y no puede eliminarse");
    this.name = "ProvinciaEnUsoError";
  }
}
