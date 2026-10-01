import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { enviarMensajeRevisor } from "@/modules/mensajeria/application/use-cases/EnviarMensajeRevisor";
import { auditarMensajeCarga } from "@/modules/mensajeria/infrastructure/auditoria/auditarMensajeCarga";
import { prismaMensajeCargaRepository } from "@/modules/mensajeria/infrastructure/repositories/PrismaMensajeCargaRepository";
import { enviarMensajeRevisorSchema } from "@/modules/mensajeria/schemas/mensaje.schema";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aMensajeVista,
  exigirRevisor,
  programarAvisoMensajeNuevo,
  respuestaCargaNoEncontrada,
  respuestaCargaNoPendiente,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/revisor/_lib/http";

// RF-31: el revisor inicia una conversación (o escribe sobre un archivo concreto) desde una carga
// `PENDIENTE_VISTO_BUENO` ya finalizada. Solo REVISOR_REPOSITORIO: un ADMIN recibe 403.
export async function POST(request: Request) {
  const acceso = await exigirRevisor();

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarMensajeCarga(acceso.sesion, request, { resultado: "RECHAZADO", motivo: "SIN_PERMISO" });
    }
    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = enviarMensajeRevisorSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await enviarMensajeRevisor(
      { cargaArchivoId: datos.data.cargaArchivoId, autorId: acceso.sesion.sub, contenido: datos.data.contenido },
      { repositorio: prismaMensajeCargaRepository, repositorioCargas: prismaCargaArchivoRepository },
    );

    if (!resultado.ok) {
      auditarMensajeCarga(acceso.sesion, request, {
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        cargaArchivoId: datos.data.cargaArchivoId,
      });

      return resultado.motivo === "NO_PENDIENTE" ? respuestaCargaNoPendiente() : respuestaCargaNoEncontrada();
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
    logger.error("Error al enviar un mensaje del revisor sobre una carga", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
