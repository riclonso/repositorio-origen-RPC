// Traducción a dominio de la violación de la FK `comuna.provinciaId` al crear o editar (P2003 en
// Prisma): la provincia elegida se eliminó entre la validación del caso de uso y la escritura.
export class ProvinciaInvalidaError extends Error {
  constructor() {
    super("La provincia seleccionada no existe");
    this.name = "ProvinciaInvalidaError";
  }
}
