import type { LectorPlantilla } from "@/modules/formatos-excel/application/ports";
import { abrirPrimeraHojaExcelJs } from "@/infrastructure/hojas-calculo/abrirHojaExcelJs";

// Tope de seguridad: si la primera fila viniera sin ninguna celda vacía (archivo corrupto o
// generado por error), este límite evita recorrer columnas indefinidamente.
const MAXIMO_COLUMNAS = 500;

// Implementación del puerto `LectorPlantilla` con `exceljs`. Un CSV se lee con el separador
// elegido para el formato y se decodifica como UTF-8 (con o sin BOM) o Windows-1252 (ver
// `abrirPrimeraHojaExcelJs`).
export const lectorPlantillaExcelJs: LectorPlantilla = {
  async leer(buffer, tipoContenido, opciones) {
    const { hoja } = await abrirPrimeraHojaExcelJs(buffer, tipoContenido, opciones.separadorCsv);

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
