import type {
  CampoUnicoComuna,
  ClavesUnicasComuna,
  Comuna,
  ComunaEliminada,
  DatosEdicionComuna,
  DatosNuevaComuna,
  FiltroListadoComunas,
} from "@/modules/comunas/domain/entities/Comuna";

export interface ComunaRepository {
  // Catálogo chico: se lista completo (o filtrado por región y/o provincia, con AND) en una sola
  // consulta, ordenado por número de región y luego por código de comuna.
  listar(filtro: FiltroListadoComunas): Promise<Comuna[]>;
  obtenerPorId(id: string): Promise<Comuna | null>;
  // Una sola consulta con OR sobre `codigo` (global) y `(provinciaId, nombreNormalizado)`.
  // Devuelve el primer campo que choca (código antes que nombre) o null. `excluirId` evita que una
  // edición que conserva sus propios valores choque consigo misma.
  buscarConflicto(claves: ClavesUnicasComuna, excluirId?: string): Promise<CampoUnicoComuna | null>;
  // Lanzan `ComunaDuplicadaError` ante una colisión UNIQUE por carrera (P2002) y
  // `ProvinciaInvalidaError` si la provincia desapareció antes de escribir (P2003).
  crear(datos: DatosNuevaComuna): Promise<Comuna>;
  // Devuelve null si la comuna ya no existe (P2025).
  actualizar(id: string, datos: DatosEdicionComuna): Promise<Comuna | null>;
  // Devuelve la provincia de la comuna borrada, o null si ya no existía (P2025). Lanza
  // `ComunaEnUsoError` ante una FK (P2003).
  eliminar(id: string): Promise<ComunaEliminada | null>;
}
