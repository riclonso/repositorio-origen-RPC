import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerHiloVentanaRevisor } from "@/modules/mensajeria/application/use-cases/ObtenerHiloVentana";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import type { HiloRevisorVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import {
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirRevisor,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
} from "@/app/api/revisor/_lib/http";

type ContextoHilo = { params: Promise<{ ventanaId: string; notificadorId: string }> };

// RF-31: hilo de un notificador en una ventana, visto por el equipo revisor. Sin efectos
// secundarios (la marca de lectura es `POST .../lectura`). Funciona aunque la ventana esté
// cerrada. Lectura: no se audita.
export async function GET(_request: Request, contexto: ContextoHilo) {
  const [{ ventanaId, notificadorId }, acceso] = await Promise.all([contexto.params, exigirRevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);
  const idNotificador = idRutaSchema.safeParse(notificadorId);

  if (!idVentana.success || !idNotificador.success) {
    return respuestaRecursoNoEncontrado();
  }

  try {
    const resultado = await obtenerHiloVentanaRevisor(
      { ventanaCargaId: idVentana.data, notificadorId: idNotificador.data },
      { repositorio: prismaMensajeCargaRepository, repositorioCargas: prismaCargaArchivoRepository },
    );

    if (!resultado.ok) {
      return respuestaRecursoNoEncontrado();
    }

    const { hilo } = resultado;
    const respuesta: HiloRevisorVista = {
      notificador: hilo.notificador,
      cargaPendiente: hilo.cargaPendiente,
      cargaDestino: hilo.cargaDestino,
      mensajes: hilo.mensajes.map((mensaje) => aMensajeVista(mensaje, acceso.sesion.sub)),
      hayMasAntiguos: hilo.hayMasAntiguos,
    };

    return NextResponse.json(respuesta);
  } catch (error) {
    logger.error("Error al obtener el hilo de mensajes de un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
