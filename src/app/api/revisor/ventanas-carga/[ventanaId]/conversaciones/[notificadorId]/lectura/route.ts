import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { marcarMensajesLeidos } from "@/modules/mensajeria/application/use-cases/MarcarMensajesLeidos";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { marcarLecturaSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirRevisor,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/revisor/_lib/http";

type ContextoLectura = { params: Promise<{ ventanaId: string; notificadorId: string }> };

// RF-31: marca como leídas las respuestas del notificador hasta `hasta` (el último mensaje que el
// cliente mostró). Bandeja compartida: queda leído para todos los revisores. Idempotente. No se
// audita (no es una escritura de negocio, solo estado de lectura).
export async function POST(request: Request, contexto: ContextoLectura) {
  const [{ ventanaId, notificadorId }, acceso] = await Promise.all([contexto.params, exigirRevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);
  const idNotificador = idRutaSchema.safeParse(notificadorId);

  if (!idVentana.success || !idNotificador.success) {
    return respuestaRecursoNoEncontrado();
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = marcarLecturaSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const actualizados = await marcarMensajesLeidos(
      {
        notificadorId: idNotificador.data,
        ventanaCargaId: idVentana.data,
        ladoLector: "REVISOR",
        hasta: datos.data.hasta,
      },
      { repositorio: prismaMensajeCargaRepository },
    );

    return NextResponse.json({ actualizados });
  } catch (error) {
    logger.error("Error al marcar como leídos los mensajes de un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
