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
