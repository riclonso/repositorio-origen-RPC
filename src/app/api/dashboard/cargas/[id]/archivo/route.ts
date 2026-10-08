import { responderDescargaCarga } from "@/app/api/_lib/descargaCarga";
import {
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

// Descarga para la revisión (ADMIN y REVISOR_REPOSITORIO): solo si está aprobada o si el notificador
// ya la finalizó y envió (`PENDIENTE_VISTO_BUENO`); el repositorio impone ambas condiciones en SQL.
// RF-38: con la columna "Fecha y hora de notificación", generada en streaming desde el original. El
// archivo tal cual se subió está en `./original`.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  return responderDescargaCarga({ cargaId: idValido.data, usuarioId: null, modo: "notificacion", solicitanteId: acceso.sesion.sub, signal: _request.signal });
}
