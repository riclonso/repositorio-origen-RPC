// Helpers genéricos (guard de sesión, formato de error) viven en `app/api/_lib/http.ts` y se
// reexportan aquí sin cambiar los imports de los endpoints de `/api/cuenta/**`, mismo patrón que
// `app/api/usuarios/_lib/http.ts`.
export {
  exigirSesion,
  respuestaError,
  respuestaSinAcceso,
  type AccesoSesion,
} from "@/app/api/_lib/http";

export const MENSAJE_ERROR_INTERNO = "No se pudo completar la operación. Intenta nuevamente.";
export const MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos";
