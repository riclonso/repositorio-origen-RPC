import type { CampoUnicoComuna } from "@/modules/comunas/domain/entities/Comuna";

// Traducción a dominio de la violación de una restricción UNIQUE de `comuna` (P2002 en Prisma).
// Permite que application/ reaccione a un duplicado sin conocer los códigos de error del ORM.
// `campo` es null cuando el motor no permite precisar qué restricción se violó.
export class ComunaDuplicadaError extends Error {
  readonly campo: CampoUnicoComuna | null;

  constructor(campo: CampoUnicoComuna | null) {
    super("Ya existe una comuna con esos datos");
    this.name = "ComunaDuplicadaError";
    this.campo = campo;
  }
}
