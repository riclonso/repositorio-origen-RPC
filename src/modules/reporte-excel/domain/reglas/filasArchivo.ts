import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Reglas puras sobre celdas y filas de un archivo reportado, sin dependencias de infraestructura.
// Viven en `domain/` porque las usan por igual la validación al subir (`ValidarYCargarArchivo`, vía
// el evaluador de reglas) y la publicación al aprobar (`DarVistoBueno`): así ambos casos de uso
// recortan las filas exactamente igual sin que `application/` dependa de `infrastructure/`.

// Normalización de una celda a texto, compartida con `ValidadoresTipoDato`.
export function aTextoCelda(valor: ValorCeldaArchivo): string {
  if (valor === null) return "";
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).trim();
}

// Vacía = ni siquiera trae texto tras normalizar. `0`, `false` y una fecha epoch NO son vacíos:
// son valores válidos de sus respectivos tipos. Un espacio o una fórmula que devuelve "" sí lo son.
export function celdaVacia(valor: ValorCeldaArchivo): boolean {
  return aTextoCelda(valor).length === 0;
}

// RF-32 (`FILA_VACIA`): verdadero si TODAS las celdas leídas de la fila (las columnas del
// encabezado) cumplen `celdaVacia()`.
export function filaCompletamenteVacia(fila: Record<string, ValorCeldaArchivo>): boolean {
  return Object.values(fila).every((valor) => celdaVacia(valor));
}

// Índice (base 0) de la última fila con al menos un dato, o -1 si ninguna lo tiene. Una sola
// pasada hacia atrás. Las filas posteriores a este índice son residuos del final (Excel escribe
// `<row>` para filas sin valores pero con alto o estilo, y `rowCount` de exceljs las incluye).
export function indiceUltimaFilaConDatos(filas: Record<string, ValorCeldaArchivo>[]): number {
  for (let indice = filas.length - 1; indice >= 0; indice--) {
    if (!filaCompletamenteVacia(filas[indice])) return indice;
  }
  return -1;
}
