import type { ErrorCargaArchivo, ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Interfaz técnica del módulo. `application/` nunca importa `exceljs` directamente: solo depende
// de este puerto. Agnóstica de si el archivo es `.xlsx` o `.csv`; esa decisión la toma la
// implementación de `infrastructure/` a partir del `tipoContenido` recibido.
//
// `filas[i]` corresponde siempre a la fila de archivo `i + 2` (la fila 1 es el encabezado): el
// arreglo incluye toda fila entre la 2 y la última usada en la hoja, aunque venga totalmente
// vacía, para que el índice nunca se desalinee del número de fila real que ve el usuario al abrir
// el archivo.
export interface LectorArchivoReporte {
  leer(
    buffer: Buffer,
    tipoContenido: string,
  ): Promise<{ encabezados: string[]; filas: Record<string, ValorCeldaArchivo>[] }>;
}

// Interfaz técnica para generar el Excel de errores descargable desde el detalle de una carga
// propia (RF-14 ampliación). Mismo criterio que `LectorArchivoReporte`: `application/` nunca
// importa `exceljs` directamente, solo depende de este puerto. Nunca recibe ni escribe datos de
// contenido de celdas del archivo original (nombres, RUTs, etc.), solo el detalle de errores.
export interface GeneradorExcelErrores {
  generar(errores: ErrorCargaArchivo[]): Promise<Buffer>;
}
