// Traducción a dominio de la violación de una clave foránea al eliminar una región (P2003 en
// Prisma). Desde RF-27 la referencia `provincia.regionId` (ON DELETE RESTRICT) corta el DELETE de
// una región con provincias; el borde responde 409 y no un 500. Cubre también cualquier tabla que
// en el futuro referencie a `region` con `Restrict`.
export class RegionEnUsoError extends Error {
  constructor() {
    super("La región está en uso y no puede eliminarse");
    this.name = "RegionEnUsoError";
  }
}
