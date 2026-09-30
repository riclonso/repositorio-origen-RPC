// Traducción a dominio de la violación de la FK `provincia.regionId` al crear o editar (P2003 en
// Prisma): la región elegida se eliminó entre la validación del caso de uso y la escritura.
export class RegionInvalidaError extends Error {
  constructor() {
    super("La región seleccionada no existe");
    this.name = "RegionInvalidaError";
  }
}
