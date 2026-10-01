import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { enviarMensajeRevisorEnConversacion } from "@/modules/mensajeria/application/use-cases/EnviarMensajeRevisor";
import { auditarMensajeCarga } from "@/modules/mensajeria/infrastructure/auditoria/auditarMensajeCarga";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { contenidoMensajeCuerpoSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirRevisor,
  idRutaSchema,
  programarAvisoMensajeNuevo,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
  respuestaSinConversacion,
} from "@/app/api/revisor/_lib/http";

type ContextoMensajes = { params: Promise<{ ventanaId: string; notificadorId: string }> };

// RF-31 (ajuste A2): el revisor continúa una conversación YA existente en ese par (notificador,
// ventana) aunque ya no haya archivo pendiente, incluso con la ventana cerrada. El servidor
// resuelve a qué carga se asocia (la pendiente si existe; si no, la del último mensaje del hilo).
// Misma auditoría y misma regla anti-ráfaga del correo que `POST /api/revisor/mensajes`.
export async function POST(request: Request, contexto: ContextoMensajes) {
  const [{ ventanaId, notificadorId }, acceso] = await Promise.all([contexto.params, exigirRevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarMensajeCarga(acceso.sesion, request, { resultado: "RECHAZADO", motivo: "SIN_PERMISO" });
    }
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);
  const idNotificador = idRutaSchema.safeParse(notificadorId);

  if (!idVentana.success || !idNotificador.success) {
    auditarMensajeCarga(acceso.sesion, request, { resultado: "RECHAZADO", motivo: "NO_ENCONTRADO" });
    return respuestaRecursoNoEncontrado();
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = contenidoMensajeCuerpoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await enviarMensajeRevisorEnConversacion(
      {
        ventanaCargaId: idVentana.data,
        notificadorId: idNotificador.data,
        autorId: acceso.sesion.sub,
        contenido: datos.data.contenido,
      },
      { repositorio: prismaMensajeCargaRepository, repositorioCargas: prismaCargaArchivoRepository },
    );

    if (!resultado.ok) {
      auditarMensajeCarga(acceso.sesion, request, {
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        ventanaCargaId: idVentana.data,
        usuarioObjetivoId: idNotificador.data,
      });

      return resultado.motivo === "SIN_CONVERSACION" ? respuestaSinConversacion() : respuestaRecursoNoEncontrado();
    }

    const { mensaje, carga, eraPrimerNoLeido } = resultado;

    auditarMensajeCarga(acceso.sesion, request, {
      resultado: "EXITO",
      cargaArchivoId: carga.id,
      ventanaCargaId: carga.ventanaCargaId,
      mensajeCargaId: mensaje.id,
      usuarioObjetivoId: carga.usuarioId,
      usuarioObjetivoRut: carga.usuarioRut,
    });

    programarAvisoMensajeNuevo(carga, eraPrimerNoLeido);

    return NextResponse.json({ mensaje: aMensajeVista(mensaje, acceso.sesion.sub) }, { status: 201 });
  } catch (error) {
    logger.error("Error al enviar un mensaje del revisor en una conversación existente", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
