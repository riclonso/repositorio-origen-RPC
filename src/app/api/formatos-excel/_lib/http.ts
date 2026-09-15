import { NextResponse } from "next/server";
import type {
  FormatoExcel,
  FormatoExcelResumen,
  TipoArchivo,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";
import {
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdminORevisor,
} from "@/app/api/_lib/http";

export { exigirAdminORevisor, respuestaError, respuestaSinAcceso, type AccesoAdminORevisor };

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "El formato de archivo no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idFormatoExcelSchema = idRutaSchema;

export const TAMANO_MAXIMO_PLANTILLA = 10 * 1024 * 1024;

export const TIPO_CONTENIDO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TIPO_CONTENIDO_CSV = "text/csv";

// Deriva el tipo de contenido a partir de la EXTENSIÓN del archivo, nunca del Content-Type que
// declara el cliente en el multipart: ambos son igual de fáciles de falsificar (el segundo se
// declara a mano, el primero basta con renombrar el archivo). Es un primer filtro barato —permite
// rechazar una extensión no soportada sin leer el archivo completo—, no la validación de fondo:
// esa la hace `tipoContenidoDesdeArchivo`, contra el contenido real.
export function tipoContenidoDesdeNombre(nombreArchivo: string): string | null {
  const nombre = nombreArchivo.toLowerCase();

  if (nombre.endsWith(".xlsx")) return TIPO_CONTENIDO_XLSX;
  if (nombre.endsWith(".csv")) return TIPO_CONTENIDO_CSV;
  return null;
}

// Firma local de archivo ZIP ("PK\x03\x04"): todo `.xlsx` es, por formato (OOXML), un ZIP, así
// que sus primeros cuatro bytes son siempre esta secuencia.
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// Muestra sobre la que se busca un byte NUL para descartar binarios disfrazados de `.csv`: no
// hace falta recorrer el archivo completo, un archivo de texto real no debería tener un NUL en
// sus primeros bytes.
const TAMANO_MUESTRA_TEXTO_CSV = 8000;

// Valida la firma real de los primeros bytes del archivo, no solo su nombre: `tipoContenidoDesdeNombre`
// (extensión) es trivial de falsificar con solo renombrar el archivo, así que un archivo arbitrario
// renombrado a `.xlsx` pasaría esa comprobación y quedaría persistido con un `tipoContenidoPlantilla`
// que no corresponde a su contenido real (el mismo valor que luego se sirve tal cual como
// `Content-Type` en la descarga). Para `.xlsx` (que por formato OOXML es un ZIP) se verifica la
// firma binaria completa; para `.csv` no existe una firma binaria confiable, así que solo se
// descarta lo obviamente no-texto (un byte NUL en la muestra inicial) y se deja que `exceljs`
// termine de validar la estructura al parsear.
export function tipoContenidoDesdeArchivo(nombreArchivo: string, buffer: Buffer): string | null {
  const tipoPorExtension = tipoContenidoDesdeNombre(nombreArchivo);

  if (!tipoPorExtension) return null;

  if (tipoPorExtension === TIPO_CONTENIDO_XLSX) {
    return buffer.subarray(0, 4).equals(FIRMA_ZIP) ? tipoPorExtension : null;
  }

  const muestra = buffer.subarray(0, TAMANO_MUESTRA_TEXTO_CSV);
  return muestra.includes(0x00) ? null : tipoPorExtension;
}

// Mapea el tipo de contenido real detectado del archivo (nunca el declarado por el cliente) al
// tipo de archivo de dominio. Solo existen hoy los dos valores de `TIPO_CONTENIDO_XLSX`/
// `TIPO_CONTENIDO_CSV`; un tercer valor no mapeado es un error de programación (un tipo de
// contenido nuevo que `tipoContenidoDesdeArchivo` empezó a aceptar sin que este mapeo lo supiera),
// no un dato inválido del cliente, así que lanza en vez de asumir un default silencioso.
export function tipoArchivoDesdeTipoContenido(tipoContenido: string): TipoArchivo {
  if (tipoContenido === TIPO_CONTENIDO_XLSX) return "EXCEL";
  if (tipoContenido === TIPO_CONTENIDO_CSV) return "CSV";

  throw new Error(`Tipo de contenido sin mapeo a TipoArchivo: "${tipoContenido}"`);
}

export type FormatoExcelDTO = Omit<FormatoExcel, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export function aFormatoExcelDTO(formato: FormatoExcel): FormatoExcelDTO {
  return { ...formato, createdAt: formato.createdAt.toISOString(), updatedAt: formato.updatedAt.toISOString() };
}

export type FormatoExcelResumenDTO = Omit<FormatoExcelResumen, "createdAt"> & { createdAt: string };

export function aFormatoExcelResumenDTO(formato: FormatoExcelResumen): FormatoExcelResumenDTO {
  return { ...formato, createdAt: formato.createdAt.toISOString() };
}

export function respuestaDuplicado(nombre: string): NextResponse {
  return respuestaError(`Ya existe un formato de archivo llamado "${nombre}"`, 409, {
    campo: "nombre",
    codigo: "DUPLICADO",
  });
}

// Rechazo de archivo (extensión/tipo o tamaño), siempre 400: es un dato inválido del formulario,
// no un fallo del servidor.
export function respuestaArchivoInvalido(mensaje: string): NextResponse {
  return respuestaError(mensaje, 400, { campo: "archivo", codigo: "ARCHIVO_INVALIDO" });
}
