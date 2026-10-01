import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { marcarMensajesLeidos } from "@/modules/mensajeria/application/use-cases/MarcarMensajesLeidos";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { marcarLecturaSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/notificador/ventanas-carga/_lib/http";

// RF-31: marca como leídos los mensajes del equipo revisor en el hilo PROPIO (`sesion.sub`) de esa
// ventana, hasta `hasta`. Idempotente. No se audita.
export async function POST(request: Request, contexto: { params: Promise<{ ventanaId: string }> }) {
  const [{ ventanaId }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);

  if (!idVentana.success) {
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
        notificadorId: acceso.sesion.sub,
        ventanaCargaId: idVentana.data,
        ladoLector: "NOTIFICADOR",
        hasta: datos.data.hasta,
      },
      { repositorio: prismaMensajeCargaRepository },
    );

    return NextResponse.json({ actualizados });
  } catch (error) {
    logger.error("Error al marcar como leídos los mensajes del equipo revisor", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
