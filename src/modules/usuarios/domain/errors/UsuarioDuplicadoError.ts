import type { CampoUnico } from "@/modules/usuarios/domain/entities/Usuario";

// Traducción a dominio de la violación de restricción UNIQUE (P2002 en Prisma). Permite que
// application/ reaccione a un duplicado sin conocer los códigos de error del ORM.
export class UsuarioDuplicadoError extends Error {
  readonly campo: CampoUnico;

  constructor(campo: CampoUnico) {
    super(`Ya existe un usuario con ese ${campo}`);
    this.name = "UsuarioDuplicadoError";
    this.campo = campo;
  }
}
