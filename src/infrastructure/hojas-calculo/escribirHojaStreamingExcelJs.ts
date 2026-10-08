import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { flujoWebDesdeNode } from "@/infrastructure/hojas-calculo/flujoWebDesdeNode";
import type { ValorCeldaPrimitivo } from "@/infrastructure/hojas-calculo/valorCelda";

// RF-38: ÚNICO punto de ESCRITURA en streaming de .xlsx (mismo criterio que `leerHojaStreamingExcelJs`
// para la lectura). Escribe una sola hoja fila a fila con `WorkbookWriter` sobre un `PassThrough`,
// sin textos compartidos (cada fila se libera al confirmarla) y con estilos solo para los formatos de
// fecha. Nunca escribe fórmulas: solo valores primitivos (un texto que empieza con "=" queda como texto).

// Bytes pendientes de leer en la salida a partir de los cuales se espera al cliente (contrapresión).
const UMBRAL_CONTRAPRESION_BYTES = 4 * 1024 * 1024;
const ESPERA_CONTRAPRESION_MS = 15;
const FILAS_ENTRE_REVISIONES = 500;

export type CeldaEscritura = { valor: ValorCeldaPrimitivo; formatoNumero?: string };

export type EscritorHojaStreaming = {
  flujo: ReadableStream<Uint8Array>;
  // Filas en orden ascendente de `numeroFila`. Espera si el cliente no está leyendo. Lanza si el
  // cliente canceló la descarga.
  escribirFila(numeroFila: number, celdas: readonly CeldaEscritura[]): Promise<void>;
  terminar(): Promise<void>;
  // Corta la descarga con error (el cliente recibe una respuesta truncada, nunca un archivo "válido").
  abortar(error: Error): void;
};

export class DescargaCanceladaError extends Error {
  constructor() {
    super("El cliente canceló la descarga");
    this.name = "DescargaCanceladaError";
  }
}

export function crearEscritorHojaStreaming(nombreHoja: string): EscritorHojaStreaming {
  const salida = new PassThrough();
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: salida, useStyles: true, useSharedStrings: false });
  const hoja = libro.addWorksheet(nombreHoja);
  let filasDesdeRevision = 0;

  async function esperarCliente(): Promise<void> {
    while (salida.readableLength > UMBRAL_CONTRAPRESION_BYTES && !salida.destroyed) {
      await new Promise((resolver) => setTimeout(resolver, ESPERA_CONTRAPRESION_MS));
    }
  }

  return {
    flujo: flujoWebDesdeNode(salida),

    async escribirFila(numeroFila, celdas) {
      if (salida.destroyed) throw new DescargaCanceladaError();

      const fila = hoja.getRow(numeroFila);
      celdas.forEach((celda, indice) => {
        if (celda.valor === null) return;
        const destino = fila.getCell(indice + 1);
        destino.value = celda.valor;
        if (celda.formatoNumero) destino.numFmt = celda.formatoNumero;
      });
      fila.commit();

      filasDesdeRevision += 1;
      if (filasDesdeRevision >= FILAS_ENTRE_REVISIONES) {
        filasDesdeRevision = 0;
        // Cede el turno para que el compresor avance y respeta al cliente lento.
        await new Promise((resolver) => setImmediate(resolver));
        await esperarCliente();
      }
    },

    async terminar() {
      if (salida.destroyed) throw new DescargaCanceladaError();
      hoja.commit();
      await libro.commit();
    },

    abortar(error) {
      salida.destroy(error);
    },
  };
}
