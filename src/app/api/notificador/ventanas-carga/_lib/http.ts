import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
  type AccesoNotificador,
} from "@/app/api/_lib/http";
import {
  aMensajeVista,
  respuestaRecursoNoEncontrado,
  respuestaSinConversacion,
} from "@/app/api/_lib/mensajeria";

// RF-31: helpers de `/api/notificador/ventanas-carga/**` (mensajería del lado notificador).
// Reexporta el guard genérico y los helpers compartidos de mensajería.
export {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
  respuestaSinConversacion,
  type AccesoNotificador,
};
