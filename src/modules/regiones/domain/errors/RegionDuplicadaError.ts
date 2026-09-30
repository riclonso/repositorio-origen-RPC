import type { CampoUnicoRegion } from "@/modules/regiones/domain/entities/Region";

// Traducción a dominio de la violación de una restricción UNIQUE de `region` (P2002 en Prisma).
// Permite que application/ reaccione a un duplicado sin conocer los códigos de error del ORM.
// `campo` es null cuando el motor no permite precisar qué restricción se violó.
export class RegionDuplicadaError extends Error {
  readonly campo: CampoUnicoRegion | null;

  constructor(campo: CampoUnicoRegion | null) {
    super("Ya existe una región con esos datos");
    this.name = "RegionDuplicadaError";
    this.campo = campo;
  }
}
