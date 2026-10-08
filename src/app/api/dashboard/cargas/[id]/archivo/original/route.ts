import { responderDescargaCarga } from "@/app/api/_lib/descargaCarga";
import {
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idCargaArchivoSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/dashboard/cargas/_lib/http";

// RF-38: "Descargar original" para ADMIN y REVISOR_REPOSITORIO: el archivo byte a byte, tal como lo
// subió el notificador (con `Content-Length`). Mismo guard y mismo `WHERE` que `../` (APROBADA o
// PENDIENTE finalizada). Desde disco en streaming, o desde la base para las cargas anteriores al
// almacenamiento en disco. No pasa por el limitador de descargas generadas.
export async function GET(_request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idCargaArchivoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  return responderDescargaCarga({ cargaId: idValido.data, usuarioId: null, modo: "original", solicitanteId: acceso.sesion.sub, signal: _request.signal });
}
