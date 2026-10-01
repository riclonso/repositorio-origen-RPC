import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { obtenerHiloVentanaNotificador } from "@/modules/mensajeria/application/use-cases/ObtenerHiloVentana";
import { responderMensajeNotificador } from "@/modules/mensajeria/application/use-cases/ResponderMensajeNotificador";
import { auditarMensajeCarga } from "@/modules/mensajeria/infrastructure/auditoria/auditarMensajeCarga";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { contenidoMensajeCuerpoSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import type { HiloNotificadorVista } from "@/modules/mensajeria/schemas/vistas-mensajeria";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirNotificador,
  idRutaSchema,
  respuestaError,
  respuestaRecursoNoEncontrado,
  respuestaSinAcceso,
  respuestaSinConversacion,
} from "@/app/api/notificador/ventanas-carga/_lib/http";

type ContextoMensajes = { params: Promise<{ ventanaId: string }> };

// RF-31: hilo propio del notificador en una ventana. La propiedad se fija con
// `notificadorId = sesion.sub`: pedir una ventana ajena devuelve una lista vacía, sin filtrar
// información. Funciona aunque la ventana esté cerrada. Lectura: no se audita.
export async function GET(_request: Request, contexto: ContextoMensajes) {
  const [{ ventanaId }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);

  if (!idVentana.success) {
    return respuestaRecursoNoEncontrado();
  }

  try {
    const hilo = await obtenerHiloVentanaNotificador(
      { ventanaCargaId: idVentana.data, notificadorId: acceso.sesion.sub },
      { repositorio: prismaMensajeCargaRepository },
    );

    const respuesta: HiloNotificadorVista = {
      mensajes: hilo.mensajes.map((mensaje) => aMensajeVista(mensaje, acceso.sesion.sub)),
      puedeResponder: hilo.puedeResponder,
      hayMasAntiguos: hilo.hayMasAntiguos,
    };

    return NextResponse.json(respuesta);
  } catch (error) {
    logger.error("Error al obtener el hilo de mensajes propio de un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// RF-31: el notificador responde en su hilo de esa ventana. Nunca inicia: sin un mensaje previo
// del equipo revisor responde 409 `SIN_CONVERSACION`. La carga a la que se asocia la resuelve el
// servidor. No se envía correo a los revisores.
export async function POST(request: Request, contexto: ContextoMensajes) {
  const [{ ventanaId }, acceso] = await Promise.all([contexto.params, exigirNotificador()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarMensajeCarga(acceso.sesion, request, { resultado: "RECHAZADO", motivo: "SIN_PERMISO" });
    }
    return respuestaSinAcceso(acceso.estado);
  }

  const idVentana = idRutaSchema.safeParse(ventanaId);

  if (!idVentana.success) {
    auditarMensajeCarga(acceso.sesion, request, { resultado: "RECHAZADO", motivo: "NO_ENCONTRADO" });
    return respuestaRecursoNoEncontrado();
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = contenidoMensajeCuerpoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await responderMensajeNotificador(
      { notificadorId: acceso.sesion.sub, ventanaCargaId: idVentana.data, contenido: datos.data.contenido },
      { repositorio: prismaMensajeCargaRepository },
    );

    if (!resultado.ok) {
      auditarMensajeCarga(acceso.sesion, request, {
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        ventanaCargaId: idVentana.data,
      });
      return respuestaSinConversacion();
    }

    const { mensaje } = resultado;

    auditarMensajeCarga(acceso.sesion, request, {
      resultado: "EXITO",
      cargaArchivoId: mensaje.cargaArchivoId,
      ventanaCargaId: mensaje.ventanaCargaId,
      mensajeCargaId: mensaje.id,
    });

    return NextResponse.json({ mensaje: aMensajeVista(mensaje, acceso.sesion.sub) }, { status: 201 });
  } catch (error) {
    logger.error("Error al responder un mensaje desde el notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
