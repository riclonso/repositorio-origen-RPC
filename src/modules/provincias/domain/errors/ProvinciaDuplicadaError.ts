import type { CampoUnicoProvincia } from "@/modules/provincias/domain/entities/Provincia";

// Traducción a dominio de la violación de una restricción UNIQUE de `provincia` (P2002 en Prisma).
// Permite que application/ reaccione a un duplicado sin conocer los códigos de error del ORM.
// `campo` es null cuando el motor no permite precisar qué restricción se violó.
export class ProvinciaDuplicadaError extends Error {
  readonly campo: CampoUnicoProvincia | null;

  constructor(campo: CampoUnicoProvincia | null) {
    super("Ya existe una provincia con esos datos");
    this.name = "ProvinciaDuplicadaError";
    this.campo = campo;
  }
}
