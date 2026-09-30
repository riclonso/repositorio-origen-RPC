import type {
  CampoUnicoRegion,
  ClavesUnicasRegion,
  DatosEdicionRegion,
  DatosNuevaRegion,
  Region,
} from "@/modules/regiones/domain/entities/Region";

export interface RegionRepository {
  // Catálogo chico: se lista completo, ordenado por número.
  listar(): Promise<Region[]>;
  obtenerPorId(id: string): Promise<Region | null>;
  // Una sola consulta con OR sobre las tres claves únicas. Devuelve el primer campo que choca
  // (en orden nombre, código, número) o null si no hay conflicto. `excluirId` evita que una
  // edición que conserva sus propios valores choque consigo misma.
  buscarConflicto(
    claves: ClavesUnicasRegion,
    excluirId?: string,
  ): Promise<CampoUnicoRegion | null>;
  // Lanzan `RegionDuplicadaError` ante una colisión UNIQUE por carrera.
  crear(datos: DatosNuevaRegion): Promise<Region>;
  // Devuelve null si la región ya no existe (P2025).
  actualizar(id: string, datos: DatosEdicionRegion): Promise<Region | null>;
  // Devuelve false si la región ya no existe (P2025). Lanza `RegionEnUsoError` ante una FK (P2003).
  eliminar(id: string): Promise<boolean>;
  // RF-27: indica si al menos una provincia pertenece a la región (para bloquear el cambio de su
  // código, que dejaría incoherente el prefijo de los códigos de sus provincias).
  tieneProvincias(id: string): Promise<boolean>;
}
