import { Readable } from "node:stream";
import ExcelJS from "exceljs";

const TIPO_CONTENIDO_CSV = "text/csv";

// Mantiene la cabecera binaria de la plantilla alineada con las columnas configuradas. En XLSX
// conserva las hojas, filas, estilos y datos existentes; en CSV ExcelJS vuelve a serializar el
// archivo como UTF-8, que es precisamente el formato que el lector de plantillas ya soporta.
//
// La función recibe los nombres ya validados por `formato-excel.schema.ts`: no interpreta datos
// del cliente ni decide qué columnas son aceptables, solo escribe la primera fila del archivo.
export async function sincronizarCabeceraPlantillaExcelJs(
  contenido: Buffer,
  tipoContenido: string,
  columnas: readonly string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  let hoja: ExcelJS.Worksheet | undefined;

  if (tipoContenido === TIPO_CONTENIDO_CSV) {
    hoja = await workbook.csv.read(Readable.from(contenido));
  } else {
    await workbook.xlsx.load(contenido as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    hoja = workbook.worksheets[0];
  }

  if (!hoja) {
    throw new Error("La plantilla no contiene una hoja para actualizar su cabecera");
  }

  const cabecera = hoja.getRow(1);
  columnas.forEach((nombre, indice) => {
    cabecera.getCell(indice + 1).value = nombre;
  });
  cabecera.commit();

  const resultado =
    tipoContenido === TIPO_CONTENIDO_CSV
      ? await workbook.csv.writeBuffer()
      : await workbook.xlsx.writeBuffer();

  return Buffer.from(resultado);
}
