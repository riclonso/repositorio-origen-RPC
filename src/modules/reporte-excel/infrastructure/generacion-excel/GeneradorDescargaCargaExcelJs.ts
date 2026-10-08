import { createReadStream } from "node:fs";
import { addAbortSignal, Readable } from "node:stream";
import { logger } from "@/infrastructure/logging/logger";
import { crearTransformAnexarColumnaCsv } from "@/infrastructure/hojas-calculo/anexarColumnaCsv";
import { flujoWebDesdeNode } from "@/infrastructure/hojas-calculo/flujoWebDesdeNode";
import {
  crearEscritorHojaStreaming,
  DescargaCanceladaError,
  type CeldaEscritura,
} from "@/infrastructure/hojas-calculo/escribirHojaStreamingExcelJs";
import { recorrerFilasPrimeraHojaXlsx, type FilaHojaStreaming, type FuenteXlsx } from "@/infrastructure/hojas-calculo/leerHojaStreamingExcelJs";
import {
  alTerminarFlujo,
  crearExclusionPorClave,
  ejecutarMientrasFluye,
  type Limitador,
} from "@/infrastructure/concurrencia/LimitadorConcurrenciaMemoria";
import type { FuenteDescarga, GeneradorDescargaCarga } from "@/modules/reporte-excel/application/ports";
import { celdaVacia } from "@/modules/reporte-excel/domain/reglas/filasArchivo";
import {
  MAXIMO_COLUMNAS_ENCABEZADO,
} from "@/modules/reporte-excel/infrastructure/validacion/MotorValidacionFilas";
import {
  OPCIONES_LECTURA_CARGA,
  celdasEncabezadoDesdeCrudos,
} from "@/modules/reporte-excel/infrastructure/validacion/ValidadorArchivoReporteStreaming";
import { detectarCodificacionCsvStreaming } from "@/shared/utils/texto-csv";
import { formatearFechaHoraSegundosChile, instanteAParedChile } from "@/shared/utils/fecha";

export const NOMBRE_COLUMNA_NOTIFICACION = "Fecha y hora de notificación";
export const NOMBRE_COLUMNA_NOTIFICACION_SISTEMA = "Fecha y hora de notificación (sistema)";

const TIPO_CONTENIDO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TIPO_CONTENIDO_CSV = "text/csv";

const FORMATO_FECHA = "dd-mm-yyyy";
const FORMATO_FECHA_HORA = "dd-mm-yyyy hh:mm";
const FORMATO_FECHA_NOTIFICACION = "dd-mm-yyyy hh:mm:ss";

function normalizarEncabezado(texto: string): string {
  return texto.normalize("NFC").trim().toLowerCase();
}

// Si el archivo ya trae una columna con ese nombre (NFC, sin espacios a los lados, sin distinguir
// mayúsculas), la agregada se llama "… (sistema)".
export function nombreColumnaNotificacion(encabezados: readonly string[]): string {
  const objetivo = normalizarEncabezado(NOMBRE_COLUMNA_NOTIFICACION);
  return encabezados.some((encabezado) => normalizarEncabezado(encabezado) === objetivo)
    ? NOMBRE_COLUMNA_NOTIFICACION_SISTEMA
    : NOMBRE_COLUMNA_NOTIFICACION;
}

function celdaDato(valor: FilaHojaStreaming["valores"][number] | undefined): CeldaEscritura {
  if (valor === undefined || valor === null) return { valor: null };
  if (valor instanceof Date) {
    const conHora =
      valor.getUTCHours() !== 0 || valor.getUTCMinutes() !== 0 || valor.getUTCSeconds() !== 0 || valor.getUTCMilliseconds() !== 0;
    return { valor, formatoNumero: conHora ? FORMATO_FECHA_HORA : FORMATO_FECHA };
  }
  return { valor };
}

// Encabezados como los lee la validación: contiguos no vacíos desde A, máximo 500.
function encabezadosDesdeFila(fila: FilaHojaStreaming): string[] {
  const encabezados: string[] = [];
  for (const celda of celdasEncabezadoDesdeCrudos(fila.crudos ?? []).slice(0, MAXIMO_COLUMNAS_ENCABEZADO)) {
    if (celda.texto.length === 0) break;
    encabezados.push(celda.texto);
  }
  return encabezados;
}

async function generarXlsx(fuente: FuenteXlsx, fechaNotificacion: Date, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  signal?.throwIfAborted();
  const iterador = recorrerFilasPrimeraHojaXlsx(fuente, { ...OPCIONES_LECTURA_CARGA, signal })[Symbol.asyncIterator]();
  let encabezados: string[] = [];
  let cantidadColumnas = 0;

  // El writer emite los primeros bytes del ZIP sin esperar la primera pasada de la hoja.
  // Así la petición ya responde mientras se prepara un Excel grande.
  const escritor = crearEscritorHojaStreaming("Datos");
  const fechaCelda: CeldaEscritura = { valor: instanteAParedChile(fechaNotificacion), formatoNumero: FORMATO_FECHA_NOTIFICACION };

  async function escribirDatos(fila: FilaHojaStreaming): Promise<void> {
    const celdas: CeldaEscritura[] = [];
    let conValor = false;
    for (let indice = 0; indice < cantidadColumnas; indice += 1) {
      const valor = fila.valores[indice] ?? null;
      if (!celdaVacia(valor)) conValor = true;
      celdas.push(celdaDato(valor));
    }
    // Las filas sin ningún valor (residuos, huecos) no se escriben ni llevan fecha.
    if (!conValor) return;
    celdas.push(fechaCelda);
    await escritor.escribirFila(fila.numeroFila, celdas);
  }

  async function producir(): Promise<void> {
    try {
      const primera = await iterador.next();
      let pendiente: FilaHojaStreaming | null = null;
      if (!primera.done) {
        if (primera.value.numeroFila === 1) encabezados = encabezadosDesdeFila(primera.value);
        else pendiente = primera.value;
      }
      signal?.throwIfAborted();
      cantidadColumnas = encabezados.length;
      await escritor.escribirFila(1, [
        ...encabezados.map((texto) => ({ valor: texto })),
        { valor: nombreColumnaNotificacion(encabezados) },
      ]);
      if (pendiente) await escribirDatos(pendiente);
      for (;;) {
        const siguiente = await iterador.next();
        if (siguiente.done) break;
        await escribirDatos(siguiente.value);
      }
      await escritor.terminar();
    } catch (error) {
      if (!signal?.aborted && !(error instanceof DescargaCanceladaError)) {
        logger.error("Error al generar la descarga de una carga con fecha de notificación", {
          error: error instanceof Error ? error.name : "desconocido",
        });
      }
      escritor.abortar(error instanceof Error ? error : new Error("Generación interrumpida"));
    } finally {
      await iterador.return(undefined).catch(() => undefined);
    }
  }

  void producir();
  return escritor.flujo;
}

function abrirBytes(fuente: FuenteDescarga, rutaAbsoluta: (referencia: string) => string): Readable {
  return "contenido" in fuente ? Readable.from([fuente.contenido]) : createReadStream(rutaAbsoluta(fuente.referencia));
}

async function generarCsv(
  fuente: FuenteDescarga,
  fechaNotificacion: Date,
  rutaAbsoluta: (referencia: string) => string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  // Primera pasada solo para decidir la codificación (con la que se escribe el encabezado nuevo).
  signal?.throwIfAborted();
  const abrir = () => {
    const lectura = abrirBytes(fuente, rutaAbsoluta);
    return signal ? addAbortSignal(signal, lectura) : lectura;
  };
  const codificacion = await detectarCodificacionCsvStreaming(abrir());
  signal?.throwIfAborted();
  const origen = abrir();
  const transformacion = crearTransformAnexarColumnaCsv({
    codificacion,
    nombreColumna: nombreColumnaNotificacion,
    valor: formatearFechaHoraSegundosChile(fechaNotificacion),
  });
  origen.on("error", (error) => transformacion.destroy(error));
  return flujoWebDesdeNode(origen.pipe(transformacion));
}

// RF-38: implementación del puerto `GeneradorDescargaCarga`. Ni el libro de entrada ni el de salida se
// cargan completos en memoria. Se pierde (y para eso existe "Descargar original"): formatos, otras
// hojas, fórmulas (queda el valor), combinación visual, validaciones, comentarios, hipervínculos
// (queda el texto), paneles inmovilizados e imágenes.
export function crearGeneradorDescargaCargaExcelJs(almacen: { rutaAbsoluta(referencia: string): string; fuenteXlsx?(referencia: string): Promise<import("unzipper").FuenteZip> }): GeneradorDescargaCarga {
  return {
    async generar({ fuente, tipoContenido, fechaNotificacion, signal }) {
      signal?.throwIfAborted();
      if (tipoContenido === TIPO_CONTENIDO_CSV) {
        return {
          flujo: await generarCsv(fuente, fechaNotificacion, (referencia) => almacen.rutaAbsoluta(referencia), signal),
          // Sin `charset`: el archivo conserva su codificación original (UTF-8 o Windows-1252).
          tipoContenido: TIPO_CONTENIDO_CSV,
        };
      }

      const fuenteXlsx: FuenteXlsx =
        "contenido" in fuente ? { buffer: fuente.contenido } : almacen.fuenteXlsx ? { fuenteZip: await almacen.fuenteXlsx(fuente.referencia) } : { ruta: almacen.rutaAbsoluta(fuente.referencia) };
      return { flujo: await generarXlsx(fuenteXlsx, fechaNotificacion, signal), tipoContenido: TIPO_CONTENIDO_XLSX };
    },
  };
}

// RF-38: espera máxima por un turno de generación. Pasado ese tiempo la petición se rechaza (503) en vez
// de dejar al cliente colgado detrás de descargas de varios minutos.
export const ESPERA_MAXIMA_DESCARGA_MS = 30_000;
// Corta la operación real y sus lecturas; no expira solo la clave dejando trabajo huérfano.
export const INACTIVIDAD_MAXIMA_DESCARGA_MS = 15 * 60_000;

// Decora el generador para que cada descarga ocupe un turno del limitador mientras se consume, con
// espera máxima (`LimitadorOcupadoError`) y a lo más UNA generación en curso por solicitante
// (`ClaveOcupadaError`); la exclusión se toma antes de esperar turno y se suelta junto con él.
export function conLimitadorDescargas(
  generador: GeneradorDescargaCarga,
  limitador: Limitador,
  opciones: { esperaMaximaMs?: number; inactividadMaximaMs?: number; exclusion?: ReturnType<typeof crearExclusionPorClave> } = {},
): GeneradorDescargaCarga {
  const exclusion = opciones.exclusion ?? crearExclusionPorClave();
  const esperaMaximaMs = opciones.esperaMaximaMs ?? ESPERA_MAXIMA_DESCARGA_MS;

  return {
    async generar(entrada) {
      entrada.signal?.throwIfAborted();
      const liberarSolicitante = entrada.solicitanteId ? exclusion.adquirir(entrada.solicitanteId) : () => undefined;
      const control = new AbortController();
      const cancelar = () => control.abort(entrada.signal?.reason);
      entrada.signal?.addEventListener("abort", cancelar, { once: true });
      const temporizador = setTimeout(
        () => control.abort(new DOMException("La descarga no avanzó dentro del tiempo permitido", "TimeoutError")),
        opciones.inactividadMaximaMs ?? INACTIVIDAD_MAXIMA_DESCARGA_MS,
      );
      temporizador.unref();
      const terminar = () => {
        clearTimeout(temporizador);
        entrada.signal?.removeEventListener("abort", cancelar);
        control.abort(new DOMException("Descarga terminada o cancelada", "AbortError"));
        liberarSolicitante();
      };
      if (entrada.signal?.aborted) cancelar();
      let tipoContenido = TIPO_CONTENIDO_XLSX;
      try {
        const flujo = await ejecutarMientrasFluye(
          limitador,
          async () => {
            const generado = await generador.generar({ ...entrada, signal: control.signal });
            tipoContenido = generado.tipoContenido;
            return generado.flujo;
          },
          { esperaMaximaMs, signal: control.signal },
        );
        return { flujo: alTerminarFlujo(flujo, terminar, control.signal, () => temporizador.refresh()), tipoContenido };
      } catch (error) {
        terminar();
        throw error;
      }
    },
  };
}
