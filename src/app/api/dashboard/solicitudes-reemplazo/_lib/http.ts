import type { NextResponse } from "next/server";
import type {
  OrigenSolicitudReemplazoCarga,
  SolicitudReemplazoCarga,
} from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import { solicitudVencida } from "@/modules/solicitudes-reemplazo/domain/entities/SolicitudReemplazoCarga";
import {
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdminORevisor,
} from "@/app/api/_lib/http";

export { exigirAdminORevisor, respuestaError, respuestaSinAcceso, type AccesoAdminORevisor };

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La solicitud no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idSolicitudReemplazoSchema = idRutaSchema;

// Vista para revisión (ADMIN/REVISOR_REPOSITORIO): sin N+1, ya trae formato, año, notificador,
// motivo, fechas y `vencida` calculado al responder.
export type SolicitudReemplazoRevisionDTO = {
  id: string;
  cargaArchivoId: string;
  formatoExcelNombre: string;
  anio: number;
  nombreArchivoOriginal: string;
  solicitadoPorNombre: string;
  solicitadoPorRut: string;
  motivo: string;
  estado: SolicitudReemplazoCarga["estado"];
  origen: OrigenSolicitudReemplazoCarga;
  revisadoPorNombre: string | null;
  revisadoEn: string | null;
  comentarioRevision: string | null;
  vencida: boolean;
  createdAt: string;
};

export function aSolicitudReemplazoRevisionDTO(
  solicitud: SolicitudReemplazoCarga,
  ahora: Date,
): SolicitudReemplazoRevisionDTO {
  return {
    id: solicitud.id,
    cargaArchivoId: solicitud.cargaArchivoId,
    formatoExcelNombre: solicitud.formatoExcelNombre,
    anio: solicitud.anio,
    nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
    solicitadoPorNombre: solicitud.solicitadoPorNombre,
    solicitadoPorRut: solicitud.solicitadoPorRut,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    origen: solicitud.origen,
    revisadoPorNombre: solicitud.revisadoPorNombre,
    revisadoEn: solicitud.revisadoEn ? solicitud.revisadoEn.toISOString() : null,
    comentarioRevision: solicitud.comentarioRevision,
    vencida: solicitudVencida(solicitud, ahora),
    createdAt: solicitud.createdAt.toISOString(),
  };
}

export function respuestaNoEncontrado(): NextResponse {
  return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
}

export function respuestaSolicitudYaResuelta(): NextResponse {
  return respuestaError("Esta solicitud ya fue resuelta por otra persona", 409, {
    codigo: "SOLICITUD_YA_RESUELTA",
  });
}
