import ExcelJS from "exceljs";
import type { GeneradorExcelErrores } from "@/modules/reporte-excel/application/ports";
import { ETIQUETAS_TIPO_ERROR, etiquetaFila } from "@/shared/utils/erroresCargaArchivo";

// Implementación del puerto `GeneradorExcelErrores` con `exceljs`. Mismas 4 columnas y mismas
// etiquetas humanas que la tabla en pantalla (`ResumenErroresCarga.tsx`): ambas reutilizan
// `ETIQUETAS_TIPO_ERROR`/`etiquetaFila` de `shared/utils/erroresCargaArchivo.ts` para no duplicar
// las reglas de presentación. No incluye ningún dato de contenido de celdas del archivo original
// (nombres, RUTs, etc.), solo fila/columna/tipo/mensaje del error.
export const generadorErroresExcelJs: GeneradorExcelErrores = {
  async generar(errores) {
    const workbook = new ExcelJS.Workbook();
    const hoja = workbook.addWorksheet("Errores");

    hoja.columns = [
      { header: "Fila", key: "fila", width: 12 },
      { header: "Columna", key: "columna", width: 24 },
      { header: "Tipo de error", key: "tipoError", width: 24 },
      { header: "Mensaje", key: "mensaje", width: 60 },
    ];

    for (const error of errores) {
      hoja.addRow({
        fila: etiquetaFila(error.numeroFila),
        columna: error.columna ?? "—",
        tipoError: ETIQUETAS_TIPO_ERROR[error.tipoError],
        mensaje: error.mensaje,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },
};
