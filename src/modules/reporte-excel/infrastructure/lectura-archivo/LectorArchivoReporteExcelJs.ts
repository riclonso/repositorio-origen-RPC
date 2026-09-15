import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { LectorArchivoReporte } from "@/modules/reporte-excel/application/ports";
import type { ValorCeldaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

const TIPO_CONTENIDO_CSV = "text/csv";

// Tope de seguridad: mismo criterio que `LectorPlantillaExcelJs`, evita recorrer columnas
// indefinidamente si la primera fila viniera sin ninguna celda vacía.
const MAXIMO_COLUMNAS = 500;

// Traduce el valor "crudo" de una celda de exceljs a uno de los cuatro tipos primitivos que
// entiende el resto del módulo. Los objetos enriquecidos de exceljs (fórmulas, texto con
// formato, hipervínculos) se reducen a su valor calculado o su texto plano; nunca se propaga un
// objeto opaco al validador de tipos.
function celdaAValor(valor: ExcelJS.CellValue): ValorCeldaArchivo {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string") {
    return valor;
  }

  if (typeof valor === "object") {
    if ("result" in valor && valor.result !== undefined) {
      return celdaAValor(valor.result as ExcelJS.CellValue);
    }
    if ("text" in valor && typeof valor.text === "string") {
      return valor.text;
    }
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((fragmento) => fragmento.text).join("");
    }
  }

  return String(valor);
}

// Implementación del puerto `LectorArchivoReporte` con `exceljs`. Csv se lee SOLO con separador
// coma y codificación UTF-8, mismo criterio ya establecido por `LectorPlantillaExcelJs`.
export const lectorArchivoReporteExcelJs: LectorArchivoReporte = {
  async leer(buffer, tipoContenido) {
    const workbook = new ExcelJS.Workbook();
    let hoja: ExcelJS.Worksheet | undefined;

    if (tipoContenido === TIPO_CONTENIDO_CSV) {
      hoja = await workbook.csv.read(Readable.from(buffer));
    } else {
      // Mismo desajuste de tipos entre el `.d.ts` de exceljs y el `Buffer` de Node ya documentado
      // en `LectorPlantillaExcelJs`; no afecta el runtime.
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      hoja = workbook.worksheets[0];
    }

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
    // `filas[i]` siempre corresponde a la fila real `i + 2`, sin desalinear el número de fila
    // que después se reporta en el resumen de errores.
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
