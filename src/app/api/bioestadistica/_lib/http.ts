import { NextResponse } from "next/server";
import type { ArchivoParaDescarga } from "@/modules/bioestadistica/application/use-cases/ObtenerArchivoCargaBioestadistica";
import type { MotivoRechazoRecepcion } from "@/modules/bioestadistica/application/use-cases/RecibirArchivoBioestadistica";
import { TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO } from "@/modules/bioestadistica/domain/entities/CargaBioestadistica";
import {
  MENSAJES_ENCABEZADOS_INVALIDOS,
  type MotivoEncabezadosInvalidos,
} from "@/modules/bioestadistica/domain/entities/ValidacionEncabezados";
import type { MotivoAuditoria } from "@/infrastructure/logging/auditoria";
import {
  exigirBioestadistica,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
} from "@/app/api/_lib/http";

export { exigirBioestadistica, idRutaSchema, respuestaError, respuestaSinAcceso, MENSAJE_DATOS_INVALIDOS, MENSAJE_ERROR_INTERNO };

export const MENSAJE_NO_ENCONTRADO = "El archivo no existe";

export function respuestaNoEncontrado(mensaje: string = MENSAJE_NO_ENCONTRADO): NextResponse {
  return respuestaError(mensaje, 404, { codigo: "NO_ENCONTRADO" });
}

type RespuestaRechazo = { mensaje: string; estado: number; codigo: string };

const ARCHIVO_INVALIDO = "ARCHIVO_INVALIDO";

// RF-37: traducción de los rechazos de la recepción a la respuesta HTTP. Los mensajes no revelan
// detalle interno ni contenido del archivo.
export function respuestaRechazoRecepcion(
  motivo: MotivoRechazoRecepcion,
  detalle: MotivoEncabezadosInvalidos | null,
): NextResponse {
  const respuestas: Record<MotivoRechazoRecepcion, RespuestaRechazo> = {
    SIN_ESTABLECIMIENTO: {
      mensaje: "Tu cuenta no tiene un establecimiento asignado. Contacta a un administrador.",
      estado: 409,
      codigo: "SIN_ESTABLECIMIENTO",
    },
    EN_PROCESO: {
      mensaje: "Ya hay un archivo de este tipo y año en procesamiento. Espera a que termine.",
      estado: 409,
      codigo: "EN_PROCESO",
    },
    SIN_ANIO_DISPONIBLE: {
      mensaje: "Este año no está disponible para reportar en este momento.",
      estado: 400,
      codigo: "SIN_ANIO_DISPONIBLE",
    },
    YA_REPORTADO: {
      mensaje: "Ya enviaste un archivo para este año. Para cambiarlo, solicita el reemplazo.",
      estado: 409,
      codigo: "YA_REPORTADO",
    },
    REEMPLAZO_NO_AUTORIZADO: {
      mensaje: "Tu autorización de reemplazo ya no está vigente. Solicita el reemplazo nuevamente.",
      estado: 409,
      codigo: "REEMPLAZO_NO_AUTORIZADO",
    },
    ARCHIVO_VACIO: { mensaje: "El archivo está vacío. Selecciona un archivo con datos.", estado: 400, codigo: ARCHIVO_INVALIDO },
    ARCHIVO_DEMASIADO_GRANDE: {
      mensaje: `El archivo no puede superar los ${TAMANO_MAXIMO_ARCHIVO_BIOESTADISTICA_TEXTO}.`,
      estado: 400,
      codigo: ARCHIVO_INVALIDO,
    },
    ARCHIVO_NO_COINCIDE: {
      mensaje: "El contenido del archivo no corresponde a su extensión (.xlsx o .csv).",
      estado: 400,
      codigo: ARCHIVO_INVALIDO,
    },
    ARCHIVO_ILEGIBLE: { mensaje: "No se pudo leer el archivo. Verifica que no esté dañado.", estado: 400, codigo: ARCHIVO_INVALIDO },
    ESTRUCTURA_INVALIDA: {
      mensaje: detalle ? MENSAJES_ENCABEZADOS_INVALIDOS[detalle] : "La fila de encabezados no es válida.",
      estado: 400,
      codigo: "ESTRUCTURA_INVALIDA",
    },
  };

  const respuesta = respuestas[motivo];
  return respuestaError(respuesta.mensaje, respuesta.estado, { codigo: respuesta.codigo });
}

// Motivo de auditoría de un rechazo de recepción: los problemas del propio archivo se agrupan como
// `ARCHIVO_INVALIDO`, igual que en la subida del notificador.
export function motivoAuditoriaRecepcion(motivo: MotivoRechazoRecepcion): MotivoAuditoria {
  switch (motivo) {
    case "ARCHIVO_VACIO":
    case "ARCHIVO_DEMASIADO_GRANDE":
    case "ARCHIVO_NO_COINCIDE":
    case "ARCHIVO_ILEGIBLE":
      return "ARCHIVO_INVALIDO";
    default:
      return motivo;
  }
}

// `filename` ASCII de respaldo (sin comillas ni caracteres fuera de ASCII imprimible) y `filename*`
// con el nombre real codificado (RFC 6266 / 5987), para que las tildes lleguen intactas.
function contentDisposition(nombreArchivo: string): string {
  const respaldo = nombreArchivo.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "'");
  return `attachment; filename="${respaldo}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`;
}

// RF-37: descarga EN STREAMING (nunca se carga el archivo completo en memoria). Común a la
// descarga propia y a la administrativa.
export function respuestaDescargaArchivo(archivo: ArchivoParaDescarga): Response {
  return new Response(archivo.flujo, {
    status: 200,
    headers: {
      "Content-Type": archivo.tipoContenidoArchivo,
      "Content-Length": String(archivo.tamanoBytes),
      "Content-Disposition": contentDisposition(archivo.nombreArchivoOriginal),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
