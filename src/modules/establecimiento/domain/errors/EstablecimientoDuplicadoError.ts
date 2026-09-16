import type { CampoUnico } from "@/modules/establecimiento/domain/entities/Establecimiento";

// Traducción a dominio de la violación de restricción UNIQUE (P2002 en Prisma). Permite que
// application/ reaccione a un duplicado sin conocer los códigos de error del ORM.
export class EstablecimientoDuplicadoError extends Error {
  readonly campo: CampoUnico;

  constructor(campo: CampoUnico) {
    super(`Ya existe un establecimiento con ese ${campo}`);
    this.name = "EstablecimientoDuplicadoError";
    this.campo = campo;
  }
}
