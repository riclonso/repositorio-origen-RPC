import ExcelJS from "exceljs";
import type { SeparadorCsv, TipoArchivo } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  TIPO_CONTENIDO_CSV,
  serializarLibroExcelJs,
} from "@/infrastructure/hojas-calculo/abrirHojaExcelJs";

const TIPO_CONTENIDO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const NOMBRE_HOJA = "Datos";

// Ancho mínimo de columna en el XLSX, en caracteres: una cabecera corta ("Edad") no debe dejar una
// columna tan angosta que el valor no se lea al digitarlo.
const ANCHO_MINIMO_COLUMNA = 12;

export type PlantillaGenerada = {
  contenido: Buffer;
  tipoContenido: string;
  extension: "xlsx" | "csv";
};

// Plantilla que descarga el NOTIFICADOR_RPC: se arma desde cero con la configuración vigente del
// formato en la BD (solo la fila de encabezados, en el orden configurado), nunca a partir del
// archivo que subió quien creó el formato. Ese archivo puede traer filas de ejemplo con datos
// reales, otras hojas, comentarios o metadatos del autor, y nada de eso debe llegar al notificador.
//
// CSV: sale con el separador del formato y en UTF-8 con BOM (vía `serializarLibroExcelJs`), igual
// que lo que el lector de archivos reportados espera recibir de vuelta.
export async function generarPlantillaDesdeColumnasExcelJs(
  columnas: readonly string[],
  tipoArchivo: TipoArchivo,
  separadorCsv: SeparadorCsv | null,
): Promise<PlantillaGenerada> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(NOMBRE_HOJA);

  const cabecera = hoja.addRow([...columnas]);

  if (tipoArchivo === "CSV") {
    return {
      contenido: await serializarLibroExcelJs(libro, TIPO_CONTENIDO_CSV, separadorCsv),
      tipoContenido: TIPO_CONTENIDO_CSV,
      extension: "csv",
    };
  }

  cabecera.font = { bold: true };
  columnas.forEach((nombre, indice) => {
    hoja.getColumn(indice + 1).width = Math.max(ANCHO_MINIMO_COLUMNA, nombre.length + 2);
  });
  hoja.views = [{ state: "frozen", ySplit: 1 }];

  return {
    contenido: await serializarLibroExcelJs(libro, TIPO_CONTENIDO_XLSX, null),
    tipoContenido: TIPO_CONTENIDO_XLSX,
    extension: "xlsx",
  };
}
