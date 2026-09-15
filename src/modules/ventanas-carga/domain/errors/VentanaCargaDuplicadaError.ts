// Traducción a dominio de la violación de restricción UNIQUE sobre `ventana_carga.anio` (P2002 en
// Prisma). Mismo rol que `FormatoDuplicadoError`: permite que `application/` reaccione a un
// duplicado sin conocer los códigos de error del ORM.
export class VentanaCargaDuplicadaError extends Error {
  readonly anio: number;

  constructor(anio: number) {
    super("Ya existe una ventana de carga para ese año");
    this.name = "VentanaCargaDuplicadaError";
    this.anio = anio;
  }
}
