// Traducción a dominio de la violación de una clave foránea al eliminar un tipo de establecimiento
// (P2003 en Prisma). RF-29: la referencia `establecimiento.tipoId` (ON DELETE RESTRICT) corta el
// DELETE de un tipo usado por al menos un establecimiento, activo o inactivo; el borde responde 409
// y no un 500. Cubre también cualquier tabla que en el futuro referencie al tipo con `Restrict`.
export class TipoEstablecimientoEnUsoError extends Error {
  constructor() {
    super("El tipo de establecimiento está en uso y no puede eliminarse");
    this.name = "TipoEstablecimientoEnUsoError";
  }
}
