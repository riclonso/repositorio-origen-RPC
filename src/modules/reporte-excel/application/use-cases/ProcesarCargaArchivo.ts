import type { FormatoExcelRepository } from "@/modules/formatos-excel/domain/repositories/FormatoExcelRepository";
import {
  MENSAJE_ARCHIVO_NO_PROCESADO,
  type ResultadoValidacionArchivo,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { CargaArchivoRepository } from "@/modules/reporte-excel/domain/repositories/CargaArchivoRepository";
import type { ValidadorArchivoReporte } from "@/modules/reporte-excel/application/ports";
import type { VentanaCargaRepository } from "@/modules/ventanas-carga/domain/repositories/VentanaCargaRepository";

export type ResultadoProcesarCargaArchivo =
  // La carga ya no estaba en PROCESANDO (otro proceso la terminó o la liberó): nada que hacer.
  | { estado: "OMITIDA" }
  | { estado: "PROCESADA"; resultado: ResultadoValidacionArchivo }
  // El archivo no se pudo leer: la carga queda CON_ERRORES con `ARCHIVO_NO_PROCESADO`. `causa` es
  // para `errores.txt` (quien lo registra decide qué conserva: nunca contenido del archivo).
  | { estado: "NO_PROCESADA"; causa: unknown };

// Resultado que se persiste cuando el archivo no se puede leer.
export const RESULTADO_ARCHIVO_NO_PROCESADO: ResultadoValidacionArchivo = {
  estado: "CON_ERRORES",
  cantidadFilasDatos: 0,
  cantidadErrores: 1,
  errores: [{ numeroFila: 0, columna: null, tipoError: "ARCHIVO_NO_PROCESADO", mensaje: MENSAJE_ARCHIVO_NO_PROCESADO }],
};

// RF-38, parte ASÍNCRONA de la subida (en `after()`, dentro del limitador de validaciones). Idempotente:
// solo actúa sobre una carga en `PROCESANDO`, y la transición final es condicional por ese estado.
// Usa el formato (columnas, reglas y enumerados) y la ventana VIGENTES al procesar: si el formato se
// editó entre la recepción y el procesamiento (segundos), rige la versión al procesar (aceptado).
export async function procesarCargaArchivo(
  cargaId: string,
  dependencias: {
    repositorio: CargaArchivoRepository;
    repositorioFormatosExcel: FormatoExcelRepository;
    repositorioVentanasCarga: VentanaCargaRepository;
    validador: ValidadorArchivoReporte;
  },
): Promise<ResultadoProcesarCargaArchivo> {
  const carga = await dependencias.repositorio.obtenerParaProcesar(cargaId);
  if (!carga || carga.estado !== "PROCESANDO") return { estado: "OMITIDA" };

  // Fuera del `try` a propósito: un fallo de la BD al leer el formato o la ventana NO es un problema
  // del archivo y no debe mostrarse como "No se pudo leer el archivo". Se propaga (quien procesa lo
  // registra en errores.txt) y la carga queda en PROCESANDO: la libera el arranque o la expiración
  // de 2 horas, y el notificador puede volver a subir. Con la BD caída, además, tampoco se podría
  // escribir un resultado. Formato y ventana inexistentes son imposibles (FK `Restrict`) y se tratan
  // igual, como falla técnica.
  const [formato, ventana] = await Promise.all([
    dependencias.repositorioFormatosExcel.obtenerPorId(carga.formatoExcelId),
    dependencias.repositorioVentanasCarga.obtenerPorId(carga.ventanaCargaId),
  ]);
  if (!formato || !ventana || !carga.rutaArchivo) throw new Error("Carga sin formato, ventana o archivo para procesar");

  let resultado: ResultadoValidacionArchivo;
  let causa: unknown = null;

  try {
    resultado = await dependencias.validador.validar({ referencia: carga.rutaArchivo }, formato, ventana);
  } catch (error) {
    // Solo la lectura del archivo: ZIP inválido, hoja demasiado grande una vez descomprimida, filas
    // fuera de orden, rangos inválidos o error de E/S.
    causa = error;
    resultado = RESULTADO_ARCHIVO_NO_PROCESADO;
  }

  const completada = await dependencias.repositorio.completarProcesamiento(cargaId, resultado);
  if (!completada) return { estado: "OMITIDA" };

  return causa === null ? { estado: "PROCESADA", resultado } : { estado: "NO_PROCESADA", causa };
}
