// Traducción a dominio de la violación de clave foránea contra `formato_excel` al escribir en
// `ventana_carga` (P2003 en Prisma). Mismo rol que `FormatoExcelInvalidoError`
// (`modules/usuarios/domain/errors/`), pero propio de este módulo: permite que `application/`
// reaccione a un formato inexistente sin conocer los códigos del ORM, y que el borde responda 400
// en vez de un 500 por error de base de datos.
export class FormatoInvalidoVentanaCargaError extends Error {
  constructor() {
    super("El formato de archivo seleccionado no existe");
    this.name = "FormatoInvalidoVentanaCargaError";
  }
}
