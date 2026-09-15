import { NextResponse } from "next/server";
import type { CargaArchivo, CargaArchivoResumen } from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import {
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoNotificador,
} from "@/app/api/_lib/http";
import {
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
} from "@/app/api/formatos-excel/_lib/http";

// Helpers genéricos (guard, formato de error, id de ruta) se reexportan desde `_lib/http.ts` del
// dominio para no cambiar los imports de las rutas. La detección de tipo de archivo (extensión +
// firma real de bytes) se reutiliza de `formatos-excel`: es una validación de transporte genérica,
// no específica de ese módulo.
export {
  exigirNotificador,
  respuestaError,
  respuestaSinAcceso,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
  type AccesoNotificador,
};

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La carga no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idCargaArchivoSchema = idRutaSchema;

// Mismo tope que la plantilla de formato de archivo (RF-13): 10 MB.
export const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024;

export type CargaArchivoDTO = Omit<CargaArchivo, "createdAt" | "updatedAt" | "vistoBuenoEn"> & {
  createdAt: string;
  updatedAt: string;
  vistoBuenoEn: string | null;
};

export function aCargaArchivoDTO(carga: CargaArchivo): CargaArchivoDTO {
  return {
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    updatedAt: carga.updatedAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
  };
}

export type CargaArchivoResumenDTO = Omit<CargaArchivoResumen, "createdAt" | "vistoBuenoEn"> & {
  createdAt: string;
  vistoBuenoEn: string | null;
};

export function aCargaArchivoResumenDTO(carga: CargaArchivoResumen): CargaArchivoResumenDTO {
  return {
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
  };
}

export function respuestaFormatoNoAsignado(): NextResponse {
  return respuestaError("No tienes ese formato de archivo asignado", 400, {
    campo: "formatoExcelId",
    codigo: "FORMATO_NO_ASIGNADO",
  });
}

// RF-15: no existe una ventana de carga abierta para el año elegido en este momento. Mismo
// criterio que `respuestaFormatoNoAsignado`: 400, nunca detalla si la ventana no existe o ya
// cerró/no ha abierto. RF-15 (ampliación): también cubre una ventana abierta pero no publicada
// (`VENTANA_NO_PUBLICADA` se mapea a esta MISMA respuesta genérica, para no revelar que existe un
// borrador).
export function respuestaSinVentanaAbierta(): NextResponse {
  return respuestaError("No hay una ventana de carga abierta para el año seleccionado", 400, {
    campo: "anio",
    codigo: "SIN_VENTANA_ABIERTA",
  });
}

// Rechazo de archivo (extensión/tipo o tamaño), siempre 400, mismo criterio que
// `formatos-excel/_lib/http.ts`.
export function respuestaArchivoInvalido(mensaje: string): NextResponse {
  return respuestaError(mensaje, 400, { campo: "archivo", codigo: "ARCHIVO_INVALIDO" });
}

export function respuestaCargaConErrores(): NextResponse {
  return respuestaError("Esta carga tiene errores y no puede recibir visto bueno", 409, {
    codigo: "CARGA_CON_ERRORES",
  });
}

export function respuestaCargaYaAprobada(): NextResponse {
  return respuestaError("Esta carga ya fue aprobada", 409, { codigo: "YA_APROBADA" });
}
