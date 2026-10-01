import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { listarConversacionesVentana } from "@/modules/mensajeria/application/use-cases/ListarConversacionesVentana";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import {
  MENSAJE_ERROR_INTERNO,
  aConversacionVista,
  exigirRevisor,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/revisor/_lib/http";

// RF-31: columna izquierda del modal de conversaciones de una ventana. Funciona aunque la ventana
// esté cerrada. Lectura: no se audita.
export async function GET(_request: Request, contexto: { params: Promise<{ ventanaId: string }> }) {
  const [{ ventanaId }, acceso] = await Promise.all([contexto.params, exigirRevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);

  if (!idVentana.success) {
    return respuestaRecursoNoEncontrado();
  }

  try {
    const conversaciones = await listarConversacionesVentana(idVentana.data, {
      repositorio: prismaMensajeCargaRepository,
    });

    return NextResponse.json({ datos: conversaciones.map(aConversacionVista) });
  } catch (error) {
    logger.error("Error al listar las conversaciones de una ventana de carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
