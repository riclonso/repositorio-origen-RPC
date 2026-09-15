// Traducción a dominio de la violación de clave foránea contra `formato_excel` al escribir en
// `usuario_formato_excel` (P2003 en Prisma). Mismo rol que `PerfilInvalidoError`: permite que
// `application/` reaccione a un formato inexistente sin conocer los códigos del ORM, y que el
// borde responda 400 en vez de un 500 por error de base de datos.
export class FormatoExcelInvalidoError extends Error {
  constructor() {
    super("Uno de los formatos de archivo seleccionados no existe");
    this.name = "FormatoExcelInvalidoError";
  }
}
