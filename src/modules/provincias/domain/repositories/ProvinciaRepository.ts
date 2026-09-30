import type {
  CampoUnicoProvincia,
  ClavesUnicasProvincia,
  DatosEdicionProvincia,
  DatosNuevaProvincia,
  FiltroListadoProvincias,
  Provincia,
  ProvinciaEliminada,
} from "@/modules/provincias/domain/entities/Provincia";

export interface ProvinciaRepository {
  // Catálogo chico: se lista completo (o filtrado por región) en una sola consulta, ordenado por
  // número de región y luego por código.
  listar(filtro: FiltroListadoProvincias): Promise<Provincia[]>;
  obtenerPorId(id: string): Promise<Provincia | null>;
  // Una sola consulta con OR sobre `codigo` (global) y `(regionId, nombreNormalizado)`. Devuelve
  // el primer campo que choca (código antes que nombre) o null. `excluirId` evita que una edición
  // que conserva sus propios valores choque consigo misma.
  buscarConflicto(
    claves: ClavesUnicasProvincia,
    excluirId?: string,
  ): Promise<CampoUnicoProvincia | null>;
  // Lanzan `ProvinciaDuplicadaError` ante una colisión UNIQUE por carrera (P2002) y
  // `RegionInvalidaError` si la región desapareció antes de escribir (P2003).
  crear(datos: DatosNuevaProvincia): Promise<Provincia>;
  // Devuelve null si la provincia ya no existe (P2025).
  actualizar(id: string, datos: DatosEdicionProvincia): Promise<Provincia | null>;
  // Devuelve la región de la provincia borrada, o null si ya no existía (P2025). Lanza
  // `ProvinciaEnUsoError` ante una FK (P2003), p. ej. si tiene comunas.
  eliminar(id: string): Promise<ProvinciaEliminada | null>;
  // RF-28: indica si al menos una comuna pertenece a la provincia (para bloquear el cambio de su
  // código, que dejaría incoherente el prefijo de los códigos de sus comunas).
  tieneComunas(id: string): Promise<boolean>;
}
