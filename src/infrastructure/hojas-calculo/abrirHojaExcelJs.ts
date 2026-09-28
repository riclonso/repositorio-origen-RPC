import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import {
  CARACTER_SEPARADOR_CSV,
  type SeparadorCsv,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import { agregarBomUtf8, decodificarTextoCsv } from "@/shared/utils/texto-csv";

export const TIPO_CONTENIDO_CSV = "text/csv";

// Formatos anteriores a la elección de separador se leían siempre con coma.
const SEPARADOR_POR_DEFECTO: SeparadorCsv = "COMA";

function caracterSeparador(separadorCsv: SeparadorCsv | null): string {
  return CARACTER_SEPARADOR_CSV[separadorCsv ?? SEPARADOR_POR_DEFECTO];
}

// Punto único de apertura de plantillas y archivos reportados con `exceljs`, compartido por el
// lector de plantillas, el sincronizador de cabecera y el lector de archivos reportados, para que
// los tres decodifiquen y separen un CSV exactamente igual.
//
// CSV: el binario se decodifica ANTES de entregarlo a exceljs (`decodificarTextoCsv`: quita el BOM
// y admite UTF-8 o Windows-1252), porque exceljs asume UTF-8 y rompía la "ñ" y las tildes de los
// CSV exportados desde Excel en Windows. Cada campo queda en su propia celda según el separador
// del formato, igual que una hoja de Excel.
export async function abrirPrimeraHojaExcelJs(
  contenido: Buffer,
  tipoContenido: string,
  separadorCsv: SeparadorCsv | null,
): Promise<{ libro: ExcelJS.Workbook; hoja: ExcelJS.Worksheet | undefined }> {
  const libro = new ExcelJS.Workbook();

  if (tipoContenido === TIPO_CONTENIDO_CSV) {
    const texto = decodificarTextoCsv(contenido);
    const hoja = await libro.csv.read(Readable.from([texto]), {
      parserOptions: { delimiter: caracterSeparador(separadorCsv) },
    });
    return { libro, hoja };
  }

  // El `.d.ts` de exceljs declara un `Buffer` ambiental propio (`extends ArrayBuffer`) que choca
  // con el `Buffer` real de Node bajo `lib: ["esnext"]`. Es una incompatibilidad de tipos de la
  // librería, no del dato: en runtime `contenido` sigue siendo el `Buffer` de Node que
  // `xlsx.load` espera.
  await libro.xlsx.load(contenido as unknown as Parameters<typeof libro.xlsx.load>[0]);
  return { libro, hoja: libro.worksheets[0] };
}

// Serializa el libro con el mismo tipo y separador con que se abrió. Un CSV sale en UTF-8 con BOM
// para que Excel en Windows lo abra sin mojibake.
export async function serializarLibroExcelJs(
  libro: ExcelJS.Workbook,
  tipoContenido: string,
  separadorCsv: SeparadorCsv | null,
): Promise<Buffer> {
  if (tipoContenido === TIPO_CONTENIDO_CSV) {
    const csv = await libro.csv.writeBuffer({
      formatterOptions: { delimiter: caracterSeparador(separadorCsv) },
    });
    return agregarBomUtf8(new Uint8Array(csv));
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
