import type {
  ArchivoCargaBioestadistica,
  CargaBioestadistica,
  CargaBioestadisticaParaProcesar,
  DatosNuevaCargaBioestadistica,
  FilaCargaBioestadistica,
  FiltroListadoCargasBioestadistica,
  MotivoFalloCargaBioestadistica,
  PaginaCargasBioestadistica,
} from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import type { TipoArchivoBioestadistica } from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";

// Desenlace de la activación (transacción corta al terminar el procesamiento).
export type ResultadoActivacionCargaBioestadistica =
  | { ok: true }
  | { ok: false; motivo: "REEMPLAZO_NO_AUTORIZADO" | "YA_REPORTADO" | "NO_PROCESANDO" };

export type DatosActivacionCargaBioestadistica = {
  cargaId: string;
  cantidadFilasDatos: number;
  procesadaEn: Date;
  // Presente solo si la carga reemplaza a la ACTIVA anterior: se consume la solicitud (condicional)
  // y la anterior pasa a REEMPLAZADA en la MISMA transacción.
  reemplazo: { cargaAnteriorId: string; solicitudId: string } | null;
};

// Referencia del archivo de una carga marcada como fallida, para que el llamador lo elimine del
// almacén después de la transacción (el disco no participa de la transacción de la base).
export type CargaFallidaConArchivo = { id: string; referenciaArchivo: string | null };

export interface CargaBioestadisticaRepository {
  // Lanza `CargaBioestadisticaEnProcesoError` si el índice único parcial de PROCESANDO rechaza el
  // INSERT (ya hay otro procesamiento para ese usuario, año y tipo).
  crearProcesando(datos: DatosNuevaCargaBioestadistica): Promise<CargaBioestadistica>;
  obtenerActiva(usuarioId: string, anio: number, tipoArchivo: TipoArchivoBioestadistica): Promise<CargaBioestadistica | null>;
  // `true` si hay un PROCESANDO más reciente que `limiteExpiracion` para esa combinación.
  existeProcesandoVigente(
    usuarioId: string,
    anio: number,
    tipoArchivo: TipoArchivoBioestadistica,
    limiteExpiracion: Date,
  ): Promise<boolean>;
  // Ownership en el `WHERE`: una carga ajena se trata como inexistente.
  obtenerPropia(id: string, usuarioId: string): Promise<CargaBioestadistica | null>;
  obtenerParaProcesar(id: string): Promise<CargaBioestadisticaParaProcesar | null>;
  // Inserta un lote con `createMany` en su propia sentencia (sin transacción que abarque los lotes).
  insertarFilas(cargaId: string, filas: FilaCargaBioestadistica[]): Promise<void>;
  activar(datos: DatosActivacionCargaBioestadistica): Promise<ResultadoActivacionCargaBioestadistica>;
  // PROCESANDO → FALLIDA con su motivo y `rutaArchivo` anulada (update condicional), y luego borra
  // sus filas. `null` si ya no estaba PROCESANDO (otro proceso la resolvió).
  marcarFallida(cargaId: string, motivo: MotivoFalloCargaBioestadistica): Promise<CargaFallidaConArchivo | null>;
  // Borra (por lotes) las filas de la carga SOLO si su cabecera está FALLIDA, con la condición
  // evaluada dentro de cada sentencia: nunca toca las de una ACTIVA ni las de una REEMPLAZADA. Limpia
  // los lotes que un procesamiento insertó después de que otro proceso la marcara FALLIDA (p. ej. por
  // vencimiento). Devuelve cuántas filas borró.
  eliminarFilasDeCargaFallida(cargaId: string): Promise<number>;
  // PROCESANDO de esa combinación más antiguos que `limiteExpiracion` → FALLIDA
  // PROCESAMIENTO_INTERRUMPIDO (update condicional).
  marcarExpiradasComoFallidas(
    usuarioId: string,
    anio: number,
    tipoArchivo: TipoArchivoBioestadistica,
    limiteExpiracion: Date,
  ): Promise<CargaFallidaConArchivo[]>;
  // Al arrancar el servidor: todo PROCESANDO creado ANTES del arranque es huérfano (asume una sola
  // instancia). El corte evita marcar una subida que llegó mientras la limpieza seguía en curso.
  marcarProcesandoAnterioresComoFallidas(creadasAntesDe: Date): Promise<CargaFallidaConArchivo[]>;
  // Panel del propio usuario: ACTIVA, PROCESANDO y las FALLIDA más recientes (tope defensivo).
  listarParaPanel(usuarioId: string): Promise<CargaBioestadistica[]>;
  // Historial propio: ACTIVA y REEMPLAZADA.
  listarHistorialPropio(usuarioId: string): Promise<CargaBioestadistica[]>;
  // Vista administrativa: ACTIVA y REEMPLAZADA del año (y tipo), paginada, con usuario y
  // establecimiento en la misma consulta.
  listarParaAdministracion(filtro: FiltroListadoCargasBioestadistica): Promise<PaginaCargasBioestadistica>;
  // Años con al menos una carga ACTIVA o REEMPLAZADA, descendente (selector del listado).
  listarAniosConCargas(): Promise<number[]>;
  // Solo ACTIVA o REEMPLAZADA con archivo; ownership en el `WHERE` en la variante propia.
  obtenerArchivoPropio(id: string, usuarioId: string): Promise<ArchivoCargaBioestadistica | null>;
  obtenerArchivo(id: string): Promise<ArchivoCargaBioestadistica | null>;
}
