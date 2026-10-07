import type { NextResponse } from "next/server";
import type {
  OrigenSolicitudReemplazoCarga,
  SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  fechaVencimientoSolicitud,
  solicitudUtilizable,
  solicitudVencida,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoNotificador,
} from "@/app/api/_lib/http";

export { exigirNotificador, respuestaError, respuestaSinAcceso, type AccesoNotificador };

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La carga no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idCargaArchivoSchema = idRutaSchema;

// Vista propia (notificador): sin datos de otros usuarios, con `vencida` ya resuelto para no
// duplicar la regla de vigencia en el cliente.
export type SolicitudReemplazoPropiaDTO = {
  id: string;
  cargaArchivoId: string;
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  motivo: string;
  estado: SolicitudReemplazoCarga["estado"];
  origen: OrigenSolicitudReemplazoCarga;
  comentarioRevision: string | null;
  revisadoEn: string | null;
  vencida: boolean;
  // `true` solo si la autorización todavía habilita subir el reemplazo (`APROBADA`, sin consumir y
  // dentro de su plazo). Una `APROBADA` ya consumida no es `vencida`, pero tampoco `utilizable`.
  utilizable: boolean;
  // RF-36: hasta cuándo habilita la subida una solicitud APROBADA (`null` si no lo está).
  venceEl: string | null;
  createdAt: string;
};

export function aSolicitudReemplazoPropiaDTO(solicitud: SolicitudReemplazoCarga, ahora: Date): SolicitudReemplazoPropiaDTO {
  return {
    id: solicitud.id,
    cargaArchivoId: solicitud.cargaArchivoId,
    formatoExcelNombre: solicitud.formatoExcelNombre,
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    origen: solicitud.origen,
    comentarioRevision: solicitud.comentarioRevision,
    revisadoEn: solicitud.revisadoEn ? solicitud.revisadoEn.toISOString() : null,
    vencida: solicitudVencida(solicitud, ahora),
    utilizable: solicitudUtilizable(solicitud, ahora),
    venceEl: fechaVencimientoSolicitud(solicitud)?.toISOString() ?? null,
    createdAt: solicitud.createdAt.toISOString(),
  };
}

export function respuestaNoEncontrado(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

export function respuestaNoEsVigente(): NextResponse {
  return respuestaError("Solo puedes solicitar el reemplazo de tu carga aprobada más reciente para esta combinación", 409, {
    codigo: "NO_ES_VIGENTE",
  });
}

export function respuestaSolicitudDuplicada(): NextResponse {
  return respuestaError("Ya existe una solicitud de reemplazo pendiente para esta carga", 409, {
    codigo: "SOLICITUD_DUPLICADA",
  });
}

// RF-36 (ajuste aprobado): una ventana eliminada, archivada o despublicada no admite reemplazos,
// así que tampoco se acepta solicitarlo.
export function respuestaVentanaNoDisponible(): NextResponse {
  return respuestaError("La ventana de esta carga ya no admite reemplazos (fue archivada, despublicada o eliminada)", 409, {
    codigo: "VENTANA_NO_DISPONIBLE",
  });
}

export function respuestaSolicitudYaAprobadaVigente(): NextResponse {
  return respuestaError("Ya tienes una autorización de reemplazo vigente para esta carga", 409, {
    codigo: "SOLICITUD_YA_APROBADA_VIGENTE",
  });
}
