// Normaliza un nombre para compararlo con independencia de tildes, mayúsculas y espacios
// redundantes. Determinista y sin depender de `unaccent()` de PostgreSQL: la clave `@unique`
// vive en la columna derivada `nombreNormalizado`, no en un índice funcional del motor.
//
// - NFD + quitar diacríticos: "Á" y "A" colapsan al mismo carácter.
// - trim + colapsar espacios: "  Clínica   Norte " y "Clínica Norte" son el mismo nombre.
// - toLowerCase: la comparación ignora mayúsculas.
export function normalizarNombre(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
