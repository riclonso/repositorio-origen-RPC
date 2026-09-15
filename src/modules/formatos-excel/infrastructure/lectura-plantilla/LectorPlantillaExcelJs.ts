import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { LectorPlantilla } from "@/modules/formatos-excel/application/ports";

const TIPO_CONTENIDO_CSV = "text/csv";

// Tope de seguridad: si la primera fila viniera sin ninguna celda vacía (archivo corrupto o
// generado por error), este límite evita recorrer columnas indefinidamente.
const MAXIMO_COLUMNAS = 500;

// Implementación del puerto `LectorPlantilla` con `exceljs`. Csv se lee SOLO con separador coma
// y codificación UTF-8, sin opciones adicionales (decisión ya tomada: `;` u otras codificaciones
// quedan fuera de este alcance).
export const lectorPlantillaExcelJs: LectorPlantilla = {
  async leer(buffer, tipoContenido) {
    const workbook = new ExcelJS.Workbook();
    let hoja: ExcelJS.Worksheet | undefined;

    if (tipoContenido === TIPO_CONTENIDO_CSV) {
      hoja = await workbook.csv.read(Readable.from(buffer));
    } else {
      // El `.d.ts` de exceljs declara un `Buffer` ambiental propio (`extends ArrayBuffer`) que
      // choca con el `Buffer` real de Node bajo `lib: ["esnext"]` (agrega miembros de
      // ArrayBuffer redimensionable que Node no implementa). Es una incompatibilidad de tipos
      // de la librería, no del dato: en runtime `buffer` sigue siendo el `Buffer` de Node que
      // `xlsx.load` espera.
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      hoja = workbook.worksheets[0];
    }

    if (!hoja) return [];

    const primeraFila = hoja.getRow(1);
    const columnas: { orden: number; nombre: string }[] = [];

    for (let indice = 1; indice <= MAXIMO_COLUMNAS; indice += 1) {
      const valor = primeraFila.getCell(indice).value;
      const texto = valor === null || valor === undefined ? "" : String(valor).trim();

      if (texto.length === 0) break;

      columnas.push({ orden: indice, nombre: texto });
    }

    return columnas;
  },
};
