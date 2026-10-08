import { responderDescargaCarga } from "@/app/api/_lib/descargaCarga";
import {
  MENSAJE_NO_ENCONTRADO,
  exigirNotificador,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/notificador/cargas/_lib/http";

// Descarga del propio archivo desde "Mis cargas" o el detalle de un intento: sin restricción de
// `estado`, pero con ownership (`usuarioId = sesión.sub`) siempre en el `WHERE` — una carga ajena
// responde 404. RF-38: si la carga ya fue notificada (finalizada, aprobada o rechazada) se descarga con
// la columna "Fecha y hora de notificación"; si no (validándose, con errores o sin finalizar), el
// archivo original.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  return responderDescargaCarga({ cargaId: idValido.data, usuarioId: acceso.sesion.sub, modo: "notificacion", solicitanteId: acceso.sesion.sub, signal: _request.signal });
}
