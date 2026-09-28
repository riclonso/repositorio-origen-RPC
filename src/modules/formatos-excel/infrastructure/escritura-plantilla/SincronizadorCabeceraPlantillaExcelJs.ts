import type { SeparadorCsv } from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  abrirPrimeraHojaExcelJs,
  serializarLibroExcelJs,
} from "@/infrastructure/hojas-calculo/abrirHojaExcelJs";

// Mantiene la cabecera binaria de la plantilla alineada con las columnas configuradas. En XLSX
// conserva las hojas, filas, estilos y datos existentes; en CSV lo vuelve a serializar con el
// separador del formato, en UTF-8 con BOM (el lector admite ambos).
//
// La función recibe los nombres ya validados por `formato-excel.schema.ts`: no interpreta datos
// del cliente ni decide qué columnas son aceptables, solo escribe la primera fila del archivo.
export async function sincronizarCabeceraPlantillaExcelJs(
  contenido: Buffer,
  tipoContenido: string,
  columnas: readonly string[],
  separadorCsv: SeparadorCsv | null,
): Promise<Buffer> {
  const { libro, hoja } = await abrirPrimeraHojaExcelJs(contenido, tipoContenido, separadorCsv);

  if (!hoja) {
    throw new Error("La plantilla no contiene una hoja para actualizar su cabecera");
  }

  const cabecera = hoja.getRow(1);
  columnas.forEach((nombre, indice) => {
    cabecera.getCell(indice + 1).value = nombre;
  });
  cabecera.commit();

  return serializarLibroExcelJs(libro, tipoContenido, separadorCsv);
}
