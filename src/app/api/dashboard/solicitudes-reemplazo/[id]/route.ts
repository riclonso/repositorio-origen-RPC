import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { revisarSolicitudReemplazo } from "@/modules/solicitudes-reemplazo/application/use-cases/RevisarSolicitudReemplazo";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { solicitudReemplazoMailer } from "@/modules/solicitudes-reemplazo/infrastructure/email/SolicitudReemplazoMailer";
import { auditarSolicitudReemplazo } from "@/modules/solicitudes-reemplazo/infrastructure/auditoria/auditarSolicitudReemplazo";
import { revisarSolicitudReemplazoSchema } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aSolicitudReemplazoRevisionDTO,
  exigirAdminORevisor,
  idSolicitudReemplazoSchema,
  respuestaError,
  respuestaNoEncontrado,
  respuestaSinAcceso,
  respuestaSolicitudYaResuelta,
} from "@/app/api/dashboard/solicitudes-reemplazo/_lib/http";

const ACCION = "SOLICITUD_REEMPLAZO_REVISADA" as const;

// Aprueba o rechaza una solicitud `PENDIENTE`. Cualquier ADMIN o REVISOR_REPOSITORIO puede
// resolver cualquier solicitud (a diferencia de la eliminación de ventanas de carga, no hay
// restricción de "solo las que yo creé"). El correo de resultado se DIFIERE con `after()`: la
// decisión ya quedó guardada y nunca se revierte porque el envío falle.
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idSolicitudReemplazoSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaNoEncontrado();
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = revisarSolicitudReemplazoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await revisarSolicitudReemplazo(
      idValido.data,
      {
        revisadoPorId: acceso.sesion.sub,
        decision: datos.data.decision,
        comentario: datos.data.comentario?.trim() || null,
      },
      { repositorio: prismaSolicitudReemplazoCargaRepository },
    );

    if (!resultado.ok) {
      auditarSolicitudReemplazo(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        solicitudReemplazoId: idValido.data,
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaNoEncontrado();
      }

      return respuestaSolicitudYaResuelta();
    }

    const { solicitud } = resultado;

    auditarSolicitudReemplazo(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      cargaArchivoId: solicitud.cargaArchivoId,
      solicitudReemplazoId: solicitud.id,
      estadoSolicitud: solicitud.estado === "APROBADA" ? "APROBADA" : "RECHAZADA",
    });

    // El correo de notificación se DIFIERE con after(): la decisión ya quedó guardada y no
    // depende de que el relay SMTP esté configurado ni de que el envío tenga éxito. Mismo
    // criterio que el correo de activación de `POST /api/usuarios`.
    after(async () => {
      try {
        const destinatario = await prismaUsuarioRepository.obtenerPorId(solicitud.solicitadoPorId);

        if (!destinatario || !solicitudReemplazoMailer.disponible()) {
          return;
        }

        await solicitudReemplazoMailer.enviarResultadoRevision({
          destinatario: { nombres: destinatario.nombres, email: destinatario.email },
          formatoExcelNombre: solicitud.formatoExcelNombre,
          anio: solicitud.anio,
          nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
          estado: solicitud.estado === "APROBADA" ? "APROBADA" : "RECHAZADA",
          comentarioRevision: solicitud.comentarioRevision,
        });
      } catch (error) {
        logger.error("Error al enviar el correo de resultado de una solicitud de reemplazo", {
          solicitudReemplazoId: solicitud.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return NextResponse.json({ solicitud: aSolicitudReemplazoRevisionDTO(solicitud, new Date()) });
  } catch (error) {
    logger.error("Error al revisar una solicitud de reemplazo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
