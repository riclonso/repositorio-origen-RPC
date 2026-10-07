import { recorrerRegistrosCsv } from "@/infrastructure/hojas-calculo/leerCsvStreaming";
import { recorrerFilasPrimeraHojaXlsx } from "@/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";
import type { ValorCeldaPrimitivo } from "@/infrastructure/hojas-calculo/valorCelda";
import type { FormatoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type {
  FilaArchivoLibre,
  LectorArchivoLibreStreaming,
  LimitadorConcurrencia,
} from "@/modules/bioestadistica/application/ports";
import { almacenArchivosBioestadistica } from "@/modules/bioestadistica/infrastructure/almacenamiento/AlmacenArchivosDisco";
import { limitadorRevisionEncabezadosBioestadistica } from "@/modules/bioestadistica/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";

function celdaATexto(valor: ValorCeldaPrimitivo): string {
  if (valor === null) return "";
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? "" : valor.toISOString();
  return String(valor);
}

async function* filasXlsx(ruta: string): AsyncGenerator<FilaArchivoLibre> {
  for await (const fila of recorrerFilasPrimeraHojaXlsx(ruta)) {
    if (fila.numeroFila <= 1) continue;
    yield { numeroFila: fila.numeroFila, valores: fila.valores };
  }
}

// Un CSV no tiene tipos: cada campo es texto. El número de fila es el número de registro (un campo
// entre comillas con saltos de línea cuenta como un solo registro).
async function* filasCsv(ruta: string): AsyncGenerator<FilaArchivoLibre> {
  for await (const registro of recorrerRegistrosCsv(ruta)) {
    if (registro.numeroRegistro <= 1) continue;
    yield { numeroFila: registro.numeroRegistro, valores: registro.campos };
  }
}

// RF-37: implementación del puerto `LectorArchivoLibreStreaming` sobre los lectores en streaming
// transversales (`infrastructure/hojas-calculo/`). Recibe cómo resolver una referencia del almacén a
// una ruta local, para no conocer el directorio base.
export function crearLectorArchivoLibreStreaming(almacen: {
  rutaAbsoluta(referencia: string): string;
}): LectorArchivoLibreStreaming {
  return {
    async leerEncabezados(referencia: string, formato: FormatoArchivoBioestadistica): Promise<string[]> {
      const ruta = almacen.rutaAbsoluta(referencia);

      if (formato === "CSV") {
        for await (const registro of recorrerRegistrosCsv(ruta)) return registro.campos;
        return [];
      }

      // Si la fila 1 está vacía exceljs no la emite: la primera emitida sería otra, y entonces no
      // hay encabezados válidos.
      for await (const fila of recorrerFilasPrimeraHojaXlsx(ruta)) {
        return fila.numeroFila === 1 ? fila.valores.map(celdaATexto) : [];
      }
      return [];
    },

    recorrerFilas(referencia: string, formato: FormatoArchivoBioestadistica): AsyncIterable<FilaArchivoLibre> {
      const ruta = almacen.rutaAbsoluta(referencia);
      return formato === "CSV" ? filasCsv(ruta) : filasXlsx(ruta);
    },
  };
}

// Decora un lector para que la revisión de encabezados corra dentro de un limitador de concurrencia.
// `recorrerFilas` no se toca: el procesamiento ya corre completo dentro de su propio limitador.
export function conEncabezadosLimitados(
  lector: LectorArchivoLibreStreaming,
  limitador: LimitadorConcurrencia,
): LectorArchivoLibreStreaming {
  return {
    leerEncabezados: (referencia, formato) => limitador.ejecutar(() => lector.leerEncabezados(referencia, formato)),
    recorrerFilas: (referencia, formato) => lector.recorrerFilas(referencia, formato),
  };
}

// Instancia de la aplicación, sobre el almacén configurado.
export const lectorArchivoLibreBioestadistica = crearLectorArchivoLibreStreaming(almacenArchivosBioestadistica);

// Variante para la recepción (dentro de la petición): revisión de encabezados acotada.
export const lectorArchivoLibreBioestadisticaRecepcion = conEncabezadosLimitados(
  lectorArchivoLibreBioestadistica,
  limitadorRevisionEncabezadosBioestadistica,
);
