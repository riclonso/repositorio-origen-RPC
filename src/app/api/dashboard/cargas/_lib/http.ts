import {
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoAdminORevisor,
} from "@/app/api/_lib/http";
import {
  aCargaArchivoDTO,
  aCargaArchivoResumenDTO,
  type CargaArchivoDTO,
  type CargaArchivoResumenDTO,
} from "@/app/api/notificador/cargas/_lib/http";

// Reexporta el guard genérico y los DTO ya definidos para `/api/notificador/cargas` (mismo tipo
// de dato, distinta audiencia): evita duplicar la conversión a DTO.
export {
  exigirAdminORevisor,
  respuestaError,
  respuestaSinAcceso,
  aCargaArchivoDTO,
  aCargaArchivoResumenDTO,
  type AccesoAdminORevisor,
  type CargaArchivoDTO,
  type CargaArchivoResumenDTO,
};

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_NO_ENCONTRADO = "La carga no existe";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";

export const idCargaArchivoSchema = idRutaSchema;

// Rechazo de cargas, ampliado (RF-20) a `APROBADA` y a `PENDIENTE_VISTO_BUENO` ya finalizada por el
// notificador. Genérico (409), sin distinguir cuál de los dos motivos exactos aplicó, mismo
// criterio de no filtrar detalle interno que `respuestaSolicitudYaResuelta`.
export function respuestaCargaNoRechazable() {
  return respuestaError("Solo se puede rechazar una carga pendiente de decisión o aprobada", 409, {
    codigo: "NO_RECHAZABLE",
  });
}

// Corrección (fin de la autoaprobación): solo se puede aprobar una carga `PENDIENTE_VISTO_BUENO`
// que el notificador ya finalizó y envió. Genérico (409), mismo criterio que
// `respuestaCargaNoRechazable`.
export function respuestaCargaNoPendiente() {
  return respuestaError(
    "Solo se puede aprobar una carga pendiente de decisión que el notificador ya haya finalizado y enviado",
    409,
    { codigo: "NO_PENDIENTE" },
  );
}
