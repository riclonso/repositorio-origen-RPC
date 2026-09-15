// Traducción a dominio de la violación de restricción UNIQUE sobre `formato_excel.nombre`
// (P2002 en Prisma). Mismo rol que `UsuarioDuplicadoError`: permite que `application/` reaccione
// a un duplicado sin conocer los códigos de error del ORM.
export class FormatoDuplicadoError extends Error {
  readonly nombre: string;

  constructor(nombre: string) {
    super("Ya existe un formato de archivo con ese nombre");
    this.name = "FormatoDuplicadoError";
    this.nombre = nombre;
  }
}
