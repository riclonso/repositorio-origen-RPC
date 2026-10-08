import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import { abrirPrimeraHojaExcelJs } from "@/infrastructure/hojas-calculo/abrirHojaExcelJs";
// Conversión de celdas compartida con el lector en streaming de Bioestadística (RF-37).
import { celdaAValor } from "@/infrastructure/hojas-calculo/valorCelda";

// RF-38: este lector EN MEMORIA ya NO se usa en producción (la validación y la descarga leen en
// streaming). Se conserva SOLO como base de la referencia congelada de la prueba de equivalencia
// (`tests/referencia/validacionEnMemoria.ts`). No modificar.

// Tope de seguridad: mismo criterio que `LectorPlantillaExcelJs`, evita recorrer columnas
// indefinidamente si la primera fila viniera sin ninguna celda vacía.
const MAXIMO_COLUMNAS = 500;

// `filas[i]` corresponde siempre a la fila de archivo `i + 2` (la fila 1 es el encabezado).
export type LectorArchivoReporte = {
  leer(
    buffer: Buffer,
    tipoContenido: string,
  ): Promise<{ encabezados: string[]; filas: Record<string, ValorCeldaArchivo>[] }>;
};

export const lectorArchivoReporteExcelJs: LectorArchivoReporte = {
  async leer(buffer, tipoContenido) {
    const { hoja } = await abrirPrimeraHojaExcelJs(buffer, tipoContenido, null);

    if (!hoja) return { encabezados: [], filas: [] };

    const primeraFila = hoja.getRow(1);
    const encabezados: string[] = [];

    for (let indice = 1; indice <= MAXIMO_COLUMNAS; indice += 1) {
      const valor = primeraFila.getCell(indice).value;
      const texto = valor === null || valor === undefined ? "" : String(valor).trim();

      if (texto.length === 0) break;

      encabezados.push(texto);
    }

    const filas: Record<string, ValorCeldaArchivo>[] = [];
    const ultimaFila = hoja.rowCount;

    // Se recorre CADA número de fila entre la 2 y la última usada, incluidas las vacías: así
    // `filas[i]` siempre corresponde a la fila real `i + 2`.
    for (let numeroFila = 2; numeroFila <= ultimaFila; numeroFila += 1) {
      const filaExcel = hoja.getRow(numeroFila);
      const registro: Record<string, ValorCeldaArchivo> = {};

      encabezados.forEach((nombreColumna, indice) => {
        registro[nombreColumna] = celdaAValor(filaExcel.getCell(indice + 1).value);
      });

      filas.push(registro);
    }

    return { encabezados, filas };
  },
};
