import {
  TAMANO_LOTE_FILAS_BIOESTADISTICA,
  TOPE_FILAS_BIOESTADISTICA,
  type FilaCargaBioestadistica,
  type MotivoFalloCargaBioestadistica,
  type ValorCeldaBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { CargaBioestadisticaRepository } from "@/modules/bioestadistica/domain/repositories/CargaBioestadisticaRepository";
import type {
  AlmacenArchivos,
  FilaArchivoLibre,
  LectorArchivoLibreStreaming,
  ValorCeldaLibre,
} from "@/modules/bioestadistica/application/ports";
import type { ContextoProcesamientoBioestadistica } from "@/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica";

export type ResultadoProcesarCargaBioestadistica =
  | { estado: "ACTIVA"; cantidadFilasDatos: number }
  | { estado: "FALLIDA"; motivo: MotivoFalloCargaBioestadistica }
  // La carga ya no estaba PROCESANDO (otro proceso la resolvió o no existe): no se hizo nada.
  | { estado: "OMITIDA" };

// JSONB no admite `Date`: las fechas viajan como ISO string. Un texto vacío se guarda como `null`.
function aValorJson(valor: ValorCeldaLibre): ValorCeldaBioestadistica {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  if (typeof valor === "string") return valor.length === 0 ? null : valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  return valor;
}

function esCeldaVacia(valor: ValorCeldaLibre): boolean {
  return valor === null || (typeof valor === "string" && valor.trim().length === 0);
}

// `Record<encabezado, valor>` con las columnas de la fila 1; las celdas más allá del último
// encabezado se ignoran. `null` si la fila está completamente vacía (se omite conservando la
// numeración real de las siguientes).
function aFilaCarga(fila: FilaArchivoLibre, encabezados: string[]): FilaCargaBioestadistica | null {
  const columnas = fila.valores.slice(0, encabezados.length);
  if (columnas.every(esCeldaVacia)) return null;

  const valores: Record<string, ValorCeldaBioestadistica> = {};
  encabezados.forEach((encabezado, indice) => {
    valores[encabezado] = aValorJson(columnas[indice] ?? null);
  });

  return { numeroFila: fila.numeroFila, valores };
}

class FalloProcesamiento extends Error {
  constructor(readonly motivo: MotivoFalloCargaBioestadistica) {
    super(motivo);
    this.name = "FalloProcesamiento";
  }
}

// Recorre las filas en streaming y las inserta por lotes de `TAMANO_LOTE_FILAS_BIOESTADISTICA`, cada
// lote en su propia sentencia (sin una transacción que los abarque): la atomicidad lógica la da el
// estado, nada en PROCESANDO es dato vigente. Devuelve la cantidad de filas de datos.
async function insertarFilasPorLotes(
  cargaId: string,
  filas: AsyncIterable<FilaArchivoLibre>,
  encabezados: string[],
  repositorio: CargaBioestadisticaRepository,
): Promise<number> {
  let lote: FilaCargaBioestadistica[] = [];
  let cantidad = 0;

  try {
    for await (const fila of filas) {
      const filaCarga = aFilaCarga(fila, encabezados);
      if (!filaCarga) continue;

      cantidad += 1;
      if (cantidad > TOPE_FILAS_BIOESTADISTICA) throw new FalloProcesamiento("TOPE_FILAS");

      lote.push(filaCarga);
      if (lote.length >= TAMANO_LOTE_FILAS_BIOESTADISTICA) {
        await repositorio.insertarFilas(cargaId, lote);
        lote = [];
      }
    }
  } catch (error) {
    if (error instanceof FalloProcesamiento) throw error;
    // Errores del lector (archivo corrupto, comillas sin cerrar, ...) son un fallo de NEGOCIO, no
    // técnico: el archivo no se puede interpretar. Los de la base se propagan como técnicos.
    if (!esErrorDeRepositorio(error)) throw new FalloProcesamiento("ARCHIVO_ILEGIBLE");
    throw error;
  }

  if (lote.length > 0) await repositorio.insertarFilas(cargaId, lote);
  return cantidad;
}

// Marca los errores que vienen del repositorio para no confundirlos con un archivo ilegible.
class ErrorRepositorio extends Error {
  constructor(readonly causa: unknown) {
    super("Error del repositorio al insertar filas");
    this.name = "ErrorRepositorio";
  }
}

function esErrorDeRepositorio(error: unknown): boolean {
  return error instanceof ErrorRepositorio;
}

function repositorioConErroresMarcados(repositorio: CargaBioestadisticaRepository): CargaBioestadisticaRepository {
  return {
    ...repositorio,
    async insertarFilas(cargaId, filas) {
      try {
        await repositorio.insertarFilas(cargaId, filas);
      } catch (error) {
        throw new ErrorRepositorio(error);
      }
    },
  };
}

// Otro proceso resolvió la carga mientras esta ejecución insertaba lotes (típicamente la marcó
// FALLIDA por vencimiento y borró las filas que había HASTA ESE MOMENTO): los lotes insertados después
// quedarían huérfanos bajo una cabecera no vigente. El repositorio solo los borra si la cabecera está
// FALLIDA (condición dentro de cada sentencia), así que nunca toca una carga ACTIVA o REEMPLAZADA.
async function omitirLimpiandoFilasHuerfanas(
  cargaId: string,
  repositorio: CargaBioestadisticaRepository,
): Promise<ResultadoProcesarCargaBioestadistica> {
  await repositorio.eliminarFilasDeCargaFallida(cargaId);
  return { estado: "OMITIDA" };
}

// Deja la carga en FALLIDA (filas borradas, ruta anulada) y elimina su archivo del disco.
async function fallar(
  cargaId: string,
  motivo: MotivoFalloCargaBioestadistica,
  dependencias: { repositorio: CargaBioestadisticaRepository; almacen: AlmacenArchivos },
): Promise<ResultadoProcesarCargaBioestadistica> {
  const fallida = await dependencias.repositorio.marcarFallida(cargaId, motivo);
  if (!fallida) return omitirLimpiandoFilasHuerfanas(cargaId, dependencias.repositorio);

  if (fallida.referenciaArchivo) await dependencias.almacen.eliminar(fallida.referenciaArchivo);
  return { estado: "FALLIDA", motivo };
}

// RF-37, parte ASÍNCRONA (en `after()`): lee el archivo en streaming, inserta sus filas por lotes y
// termina con una activación en una transacción corta (consumo condicional de la solicitud si es un
// reemplazo, la ACTIVA anterior a REEMPLAZADA, esta a ACTIVA). Ante cualquier fallo de negocio la
// carga queda FALLIDA con su código y su archivo se elimina. Un error técnico (base de datos) la deja
// FALLIDA con PROCESAMIENTO_INTERRUMPIDO y se relanza para que el llamador lo registre en
// errores.txt.
export async function procesarCargaBioestadistica(
  cargaId: string,
  contexto: ContextoProcesamientoBioestadistica,
  dependencias: {
    repositorio: CargaBioestadisticaRepository;
    lector: LectorArchivoLibreStreaming;
    almacen: AlmacenArchivos;
    ahora?: () => Date;
  },
): Promise<ResultadoProcesarCargaBioestadistica> {
  const carga = await dependencias.repositorio.obtenerParaProcesar(cargaId);
  if (!carga || carga.estado !== "PROCESANDO") return { estado: "OMITIDA" };
  if (!carga.referenciaArchivo) return fallar(cargaId, "ARCHIVO_ILEGIBLE", dependencias);

  const repositorioMarcado = repositorioConErroresMarcados(dependencias.repositorio);
  let cantidadFilasDatos: number;

  try {
    cantidadFilasDatos = await insertarFilasPorLotes(
      cargaId,
      dependencias.lector.recorrerFilas(carga.referenciaArchivo, carga.formato),
      carga.encabezados,
      repositorioMarcado,
    );
  } catch (error) {
    if (error instanceof FalloProcesamiento) return fallar(cargaId, error.motivo, dependencias);

    // Error técnico (base de datos): la carga no puede quedar PROCESANDO para siempre.
    await fallar(cargaId, "PROCESAMIENTO_INTERRUMPIDO", dependencias);
    throw error instanceof ErrorRepositorio ? error.causa : error;
  }

  if (cantidadFilasDatos === 0) return fallar(cargaId, "SIN_FILAS_DATOS", dependencias);

  let activacion: Awaited<ReturnType<CargaBioestadisticaRepository["activar"]>>;

  try {
    activacion = await dependencias.repositorio.activar({
      cargaId,
      cantidadFilasDatos,
      procesadaEn: dependencias.ahora?.() ?? new Date(),
      reemplazo: contexto.reemplazo,
    });
  } catch (error) {
    await fallar(cargaId, "PROCESAMIENTO_INTERRUMPIDO", dependencias);
    throw error;
  }

  if (!activacion.ok) {
    return activacion.motivo === "NO_PROCESANDO"
      ? omitirLimpiandoFilasHuerfanas(cargaId, dependencias.repositorio)
      : fallar(cargaId, activacion.motivo, dependencias);
  }

  return { estado: "ACTIVA", cantidadFilasDatos };
}
