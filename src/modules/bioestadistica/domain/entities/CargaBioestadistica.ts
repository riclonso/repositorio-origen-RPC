// RF-37: archivo de Defunciones o Egresos reportado por una persona con perfil Bioestadística para un
// año. Formato libre (.xlsx o .csv), hasta 200 MB, guardado en disco y procesado de forma asíncrona:
// recibido → `PROCESANDO` → `ACTIVA` (o `FALLIDA`). Al activarse un reemplazo autorizado, la anterior
// pasa a `REEMPLAZADA` (desactivada, conserva sus filas y su archivo).
import {
  TIPOS_ARCHIVO_BIOESTADISTICA,
  type TipoArchivoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/TipoArchivoBioestadistica";

export const ESTADOS_CARGA_BIOESTADISTICA = ["PROCESANDO", "ACTIVA", "REEMPLAZADA", "FALLIDA"] as const;
export type EstadoCargaBioestadistica = (typeof ESTADOS_CARGA_BIOESTADISTICA)[number];

// Códigos de fallo persistidos en `motivoFallo` (nunca contenido del archivo).
export const MOTIVOS_FALLO_CARGA_BIOESTADISTICA = [
  "ENCABEZADOS_INVALIDOS",
  "SIN_FILAS_DATOS",
  "TOPE_FILAS",
  "ARCHIVO_ILEGIBLE",
  "REEMPLAZO_NO_AUTORIZADO",
  "YA_REPORTADO",
  "PROCESAMIENTO_INTERRUMPIDO",
] as const;
export type MotivoFalloCargaBioestadistica = (typeof MOTIVOS_FALLO_CARGA_BIOESTADISTICA)[number];

export const MENSAJES_MOTIVO_FALLO: Record<MotivoFalloCargaBioestadistica, string> = {
  ENCABEZADOS_INVALIDOS: "La fila de encabezados no es válida.",
  SIN_FILAS_DATOS: "El archivo no tiene filas de datos bajo los encabezados.",
  TOPE_FILAS: "El archivo supera el máximo de filas permitido.",
  ARCHIVO_ILEGIBLE: "No se pudo leer el contenido del archivo.",
  REEMPLAZO_NO_AUTORIZADO: "La autorización de reemplazo ya no estaba disponible al terminar de procesarlo.",
  YA_REPORTADO: "Ya existía un archivo vigente para este año y tipo.",
  PROCESAMIENTO_INTERRUMPIDO: "El procesamiento se interrumpió. Vuelve a subir el archivo.",
};

const BYTES_POR_MB = 1024 * 1024;

// Límites de recepción y procesamiento (defensa contra denegación de servicio).
export const TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA = 200 * BYTES_POR_MB;
export const TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO = "200 MB";
export const TOPE_FILAS_BIOESTADISTICA = 2_000_000;
export const MAXIMO_COLUMNAS_BIOESTADISTICA = 500;
export const TAMANO_LOTE_FILAS_BIOESTADISTICA = 5000;
// Un `PROCESANDO` más antiguo se considera huérfano (proceso caído a mitad de camino).
export const HORAS_EXPIRACION_PROCESAMIENTO = 2;
export const LONGITUD_MAXIMA_NOMBRE_ARCHIVO = 255;

export type FormatoArchivoBioestadistica = "XLSX" | "CSV";

export const TIPO_CONTENIDO_POR_FORMATO: Record<FormatoArchivoBioestadistica, string> = {
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv",
};

export const EXTENSION_POR_FORMATO: Record<FormatoArchivoBioestadistica, "xlsx" | "csv"> = {
  XLSX: "xlsx",
  CSV: "csv",
};

export function formatoDesdeTipoContenido(tipoContenido: string): FormatoArchivoBioestadistica {
  return tipoContenido === TIPO_CONTENIDO_POR_FORMATO.CSV ? "CSV" : "XLSX";
}

// Primeros bytes que se revisan en un CSV para descartar binarios (un byte NUL no aparece en texto).
export const BYTES_REVISION_FIRMA_CSV = 8000;

const FIRMA_ZIP = [0x50, 0x4b, 0x03, 0x04] as const;

// Formato decidido por la extensión del nombre Y confirmado por la firma de los primeros bytes: un
// .xlsx es un ZIP (`PK\x03\x04`); un .csv es texto (sin bytes NUL en el primer bloque). `null` si no
// coinciden o la extensión no se admite. Nunca se confía en el `Content-Type` del cliente.
export function detectarFormatoArchivo(
  nombreArchivo: string,
  primerosBytes: Uint8Array,
): FormatoArchivoBioestadistica | null {
  const nombre = nombreArchivo.toLowerCase();

  if (nombre.endsWith(".xlsx")) {
    const esZip = FIRMA_ZIP.every((byte, indice) => primerosBytes[indice] === byte);
    return esZip ? "XLSX" : null;
  }

  if (nombre.endsWith(".csv")) {
    const revisados = primerosBytes.subarray(0, BYTES_REVISION_FIRMA_CSV);
    return revisados.length > 0 && !revisados.includes(0) ? "CSV" : null;
  }

  return null;
}

export function extensionAdmitida(nombreArchivo: string): boolean {
  const nombre = nombreArchivo.toLowerCase();
  return nombre.endsWith(".xlsx") || nombre.endsWith(".csv");
}

// Vista de dominio de la cabecera. No expone la ruta física del archivo: la descarga y el
// procesamiento la obtienen del repositorio por métodos propios.
export type CargaBioestadistica = {
  id: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  usuarioId: string;
  usuarioNombre: string;
  usuarioRut: string;
  establecimientoId: string;
  establecimientoNombre: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  tamanoBytes: number;
  sha256: string;
  encabezados: string[];
  cantidadFilasDatos: number;
  estado: EstadoCargaBioestadistica;
  motivoFallo: MotivoFalloCargaBioestadistica | null;
  procesadaEn: Date | null;
  desactivadaEn: Date | null;
  reemplazadaPorCargaId: string | null;
  createdAt: Date;
};

export type DatosNuevaCargaBioestadistica = {
  id: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  usuarioId: string;
  establecimientoId: string;
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  referenciaArchivo: string;
  tamanoBytes: number;
  sha256: string;
  encabezados: string[];
};

// Lo que necesita el procesamiento asíncrono: la referencia (relativa) del archivo en el almacén.
export type CargaBioestadisticaParaProcesar = {
  id: string;
  usuarioId: string;
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  estado: EstadoCargaBioestadistica;
  formato: FormatoArchivoBioestadistica;
  referenciaArchivo: string | null;
  encabezados: string[];
};

export type ArchivoCargaBioestadistica = {
  nombreArchivoOriginal: string;
  tipoContenidoArchivo: string;
  referenciaArchivo: string;
};

// Valor de una celda ya serializable a JSON (las fechas viajan como ISO string).
export type ValorCeldaBioestadistica = string | number | boolean | null;

export type FilaCargaBioestadistica = {
  numeroFila: number;
  valores: Record<string, ValorCeldaBioestadistica>;
};

export function esTipoArchivoBioestadistica(valor: string): valor is TipoArchivoBioestadistica {
  return (TIPOS_ARCHIVO_BIOESTADISTICA as readonly string[]).includes(valor);
}

const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;

// Instante antes del cual un `PROCESANDO` se considera huérfano.
export function limiteExpiracionProcesamiento(ahora: Date): Date {
  return new Date(ahora.getTime() - HORAS_EXPIRACION_PROCESAMIENTO * MILISEGUNDOS_POR_HORA);
}

// Respaldo de `MarcarProcesamientosHuerfanosComoFallidos` (que corre al arrancar): un `PROCESANDO`
// de más de `HORAS_EXPIRACION_PROCESAMIENTO` horas se trata en lectura como interrumpido.
export function procesamientoExpirado(carga: Pick<CargaBioestadistica, "estado" | "createdAt">, ahora: Date): boolean {
  return carga.estado === "PROCESANDO" && carga.createdAt.getTime() < limiteExpiracionProcesamiento(ahora).getTime();
}

export type GrupoHistorialBioestadistica = {
  anio: number;
  tipoArchivo: TipoArchivoBioestadistica;
  vigente: CargaBioestadistica | null;
  reemplazadas: CargaBioestadistica[];
};

// "Mis archivos": un grupo por (año, tipo) con la vigente (ACTIVA) y las reemplazadas anidadas, de
// la más reciente a la más antigua. Ignora `PROCESANDO` y `FALLIDA` (no son historial). Grupos
// ordenados por año descendente y, dentro del año, en el orden de `TIPOS_ARCHIVO_BIOESTADISTICA`.
export function agruparHistorialPorAnioYTipo(cargas: CargaBioestadistica[]): GrupoHistorialBioestadistica[] {
  const grupos = new Map<string, GrupoHistorialBioestadistica>();

  for (const carga of cargas) {
    if (carga.estado !== "ACTIVA" && carga.estado !== "REEMPLAZADA") continue;

    const clave = `${carga.anio}::${carga.tipoArchivo}`;
    const grupo = grupos.get(clave) ?? { anio: carga.anio, tipoArchivo: carga.tipoArchivo, vigente: null, reemplazadas: [] };

    if (carga.estado === "ACTIVA") grupo.vigente = carga;
    else grupo.reemplazadas.push(carga);

    grupos.set(clave, grupo);
  }

  const ordenTipo = (tipo: TipoArchivoBioestadistica) => TIPOS_ARCHIVO_BIOESTADISTICA.indexOf(tipo);

  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      reemplazadas: grupo.reemplazadas.toSorted(
        (a, b) => (b.desactivadaEn?.getTime() ?? 0) - (a.desactivadaEn?.getTime() ?? 0),
      ),
    }))
    .toSorted((a, b) => b.anio - a.anio || ordenTipo(a.tipoArchivo) - ordenTipo(b.tipoArchivo));
}

export type FiltroListadoCargasBioestadistica = {
  anio: number;
  tipoArchivo?: TipoArchivoBioestadistica;
  pagina: number;
  tamano: number;
};

export type PaginaCargasBioestadistica = {
  filas: CargaBioestadistica[];
  total: number;
};
