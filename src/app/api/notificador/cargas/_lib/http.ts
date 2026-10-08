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
  tipoArchivoDesdeTipoContenido,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
  tipoContenidoDesdePrimerosBytes,
} from "@/app/api/formatos-excel/_lib/http";
import {
  TAMANO_MAXIMO_ARCHIVO_CARGA,
  TAMANO_MAXIMO_ARCHIVO_CARGA_TEXTO,
} from "@/modules/reporte-excel/domain/entities/CargaArchivo";
import type { MotivoRechazoRecepcionCarga } from "@/modules/reporte-excel/application/use-cases/RecibirArchivoCarga";
import type { MotivoAuditoria } from "@/infrastructure/logging/auditoria";

// Helpers genéricos (guard, formato de error, id de ruta) se reexportan desde `_lib/http.ts` del
// dominio para no cambiar los imports de las rutas. La detección de tipo de archivo (extensión +
// firma real de bytes) se reutiliza de `formatos-excel`: es una validación de transporte genérica,
// no específica de ese módulo.
export {
  exigirNotificador,
  respuestaError,
  respuestaSinAcceso,
  tipoArchivoDesdeTipoContenido,
  tipoContenidoDesdeArchivo,
  tipoContenidoDesdeNombre,
  tipoContenidoDesdePrimerosBytes,
  type AccesoNotificador,
};

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La carga no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idCargaArchivoSchema = idRutaSchema;

// RF-38: 100 MB, medido mientras se recibe (antes 10 MB, el mismo de la plantilla de formato).
export const TAMANO_MAXIMO_ARCHIVO = TAMANO_MAXIMO_ARCHIVO_CARGA;

export type CargaArchivoDTO = Omit<CargaArchivo, "createdAt" | "updatedAt" | "vistoBuenoEn" | "finalizadaEn"> & {
  createdAt: string;
  updatedAt: string;
  vistoBuenoEn: string | null;
  finalizadaEn: string | null;
};

export function aCargaArchivoDTO(carga: CargaArchivo): CargaArchivoDTO {
  return {
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    updatedAt: carga.updatedAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
    finalizadaEn: carga.finalizadaEn ? carga.finalizadaEn.toISOString() : null,
  };
}

// Genérico para conservar campos extra del resumen al serializar (p.ej. `publicacionActiva` de
// `CargaArchivoResumenConPublicacion`, que expone GET /api/notificador/cargas).
export type CargaArchivoResumenDTO<T extends CargaArchivoResumen = CargaArchivoResumen> = Omit<
  T,
  "createdAt" | "vistoBuenoEn" | "finalizadaEn"
> & {
  createdAt: string;
  vistoBuenoEn: string | null;
  finalizadaEn: string | null;
};

export function aCargaArchivoResumenDTO<T extends CargaArchivoResumen>(carga: T): CargaArchivoResumenDTO<T> {
  return {
    ...carga,
    createdAt: carga.createdAt.toISOString(),
    vistoBuenoEn: carga.vistoBuenoEn ? carga.vistoBuenoEn.toISOString() : null,
    finalizadaEn: carga.finalizadaEn ? carga.finalizadaEn.toISOString() : null,
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

// Corrección (fin de la autoaprobación): ya existe, para esta combinación (formato, ventana), una
// carga finalizada por el notificador y todavía sin decidir por un tercero. Mismo criterio que
// `respuestaSinVentanaAbierta`: no revela más detalle que el necesario, y en la práctica no debería
// alcanzarse desde la UI (la tarjeta desaparece por completo mientras esté en este estado).
export function respuestaCargaPendienteDeDecision(): NextResponse {
  return respuestaError(
    "Ya existe una carga pendiente de decisión para esta combinación. Espera a que sea aprobada o rechazada.",
    409,
    { codigo: "CARGA_PENDIENTE_DECISION" },
  );
}

// Extensión "solicitudes de reemplazo": ya existe una carga aprobada vigente para esta combinación
// y no hay una autorización de reemplazo vigente. Mismo criterio que `respuestaSinVentanaAbierta`:
// no detalla si nunca se pidió el reemplazo, si fue rechazado o si ya venció.
export function respuestaReemplazoNoAutorizado(): NextResponse {
  return respuestaError(
    "Ya existe una carga aprobada para esta combinación. Solicita un reemplazo y espera su aprobación antes de volver a subir.",
    409,
    { codigo: "REEMPLAZO_NO_AUTORIZADO" },
  );
}

// RF-38: ya hay un archivo validándose para esta combinación (formato, año).
export function respuestaEnProceso(): NextResponse {
  return respuestaError("Ya hay un archivo validándose para este formato y año. Espera a que termine.", 409, {
    codigo: "EN_PROCESO",
  });
}

// RF-38: traducción de cada rechazo de la recepción a su respuesta HTTP (mismos mensajes que antes de
// RF-38 para los motivos existentes). Nunca revela detalle interno.
export function respuestaRechazoRecepcionCarga(motivo: MotivoRechazoRecepcionCarga): NextResponse {
  switch (motivo) {
    case "FORMATO_NO_ASIGNADO":
      return respuestaFormatoNoAsignado();
    case "ARCHIVO_NO_EXCEL":
      return respuestaArchivoInvalido("El archivo debe ser Excel (.xlsx)");
    case "REEMPLAZO_NO_AUTORIZADO":
      return respuestaReemplazoNoAutorizado();
    case "CARGA_PENDIENTE_DECISION":
      return respuestaCargaPendienteDeDecision();
    case "EN_PROCESO":
      return respuestaEnProceso();
    case "ARCHIVO_VACIO":
      return respuestaArchivoInvalido("El archivo está vacío. Selecciona un archivo con datos");
    case "ARCHIVO_DEMASIADO_GRANDE":
      return respuestaArchivoInvalido(`El archivo no puede superar los ${TAMANO_MAXIMO_ARCHIVO_CARGA_TEXTO}`);
    case "ARCHIVO_NO_COINCIDE":
      return respuestaArchivoInvalido("El contenido del archivo no corresponde a su extensión");
    // `SIN_VENTANA_ABIERTA` y `VENTANA_NO_PUBLICADA` comparten la misma respuesta genérica: no debe
    // revelarse que existe un borrador.
    case "SIN_VENTANA_ABIERTA":
    case "VENTANA_NO_PUBLICADA":
      return respuestaSinVentanaAbierta();
  }
}

// Motivo de auditoría: los problemas del propio archivo se agrupan como `ARCHIVO_INVALIDO`, como antes.
export function motivoAuditoriaRecepcionCarga(motivo: MotivoRechazoRecepcionCarga): MotivoAuditoria {
  switch (motivo) {
    case "ARCHIVO_VACIO":
    case "ARCHIVO_DEMASIADO_GRANDE":
    case "ARCHIVO_NO_COINCIDE":
      return "ARCHIVO_INVALIDO";
    default:
      return motivo;
  }
}

// Mismo código que `respuestaReemplazoNoAutorizado`, con un mensaje orientador para el paso de
// finalizar: la subida sí estaba autorizada, pero la autorización venció (o se consumió) antes de
// finalizar.
export function respuestaReemplazoNoVigenteAlFinalizar(): NextResponse {
  return respuestaError("Tu autorización de reemplazo ya no está vigente; solicita una nueva", 409, {
    codigo: "REEMPLAZO_NO_AUTORIZADO",
  });
}
