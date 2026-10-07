import { NextResponse, after } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { revisarSolicitudReemplazoBioestadistica } from "@/modules/bioestadistica/application/use-cases/RevisarSolicitudReemplazoBioestadistica";
import {
  fechaVencimientoSolicitudBioestadistica,
  type SolicitudReemplazoBioestadistica,
} from "@/modules/bioestadistica/domain/entities/SolicitudReemplazoBioestadistica";
import { prismaSolicitudReemplazoBioestadisticaRepository } from "@/modules/bioestadistica/infrastructure/repositories/PrismaSolicitudReemplazoBioestadisticaRepository";
import { solicitudReemplazoBioestadisticaMailer } from "@/modules/bioestadistica/infrastructure/email/SolicitudReemplazoBioestadisticaMailer";
import {
  auditarBioestadistica,
  capturarTransporte,
} from "@/modules/bioestadistica/infrastructure/auditoria/auditarBioestadistica";
import { revisarSolicitudReemplazoSchema } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { prismaVentanaCargaRepository } from "@/modules/ventanas-carga/infrastructure/repositories/PrismaVentanaCargaRepository";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  exigirAdminORevisor,
  idRutaSchema,
  respuestaError,
  respuestaSinAcceso,
} from "@/app/api/_lib/http";

const ACCION = "SOLICITUD_REEMPLAZO_BIOESTADISTICA_REVISADA" as const;

function respuestaNoEncontrada(): NextResponse {
  return respuestaError("La solicitud no existe", 404, { codigo: "NO_ENCONTRADO" });
}

// Correo de resultado, diferido: la decisión ya quedó guardada y nunca se revierte si el envío falla.
async function notificarResultado(solicitud: SolicitudReemplazoBioestadistica): Promise<void> {
  try {
    const destinatario = await prismaUsuarioRepository.obtenerPorId(solicitud.solicitadoPorId);
    if (!destinatario || !solicitudReemplazoBioestadisticaMailer.disponible()) return;

    const resumenes = await prismaVentanaCargaRepository.listarDiasVigenciaPorAnio([solicitud.anio]);
    const resumenAnio = resumenes.find((resumen) => resumen.anio === solicitud.anio) ?? null;

    await solicitudReemplazoBioestadisticaMailer.enviarResultadoRevision({
      destinatario: { nombres: destinatario.nombres, email: destinatario.email },
      tipoArchivo: solicitud.tipoArchivo,
      anio: solicitud.anio,
      nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
      estado: solicitud.estado === "APROBADA" ? "APROBADA" : "RECHAZADA",
      comentarioRevision: solicitud.comentarioRevision,
      venceEl: fechaVencimientoSolicitudBioestadistica(solicitud, resumenAnio),
    });
  } catch (error) {
    logger.error("Error al enviar el correo de resultado de una solicitud de reemplazo de Bioestadística", {
      solicitudReemplazoBioestadisticaId: solicitud.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// RF-37: ADMIN o REVISOR_REPOSITORIO aprueban o rechazan una solicitud de reemplazo de
// Bioestadística. Al aprobar se copian los días de vigencia del año (máximo de sus ventanas, o 7).
export async function PATCH(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idRutaSchema.safeParse(id);
  if (!idValido.success) return respuestaNoEncontrada();

  const cuerpo = await request.json().catch(() => null);
  const datos = revisarSolicitudReemplazoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  const transporte = capturarTransporte(request);

  try {
    const resultado = await revisarSolicitudReemplazoBioestadistica(
      idValido.data,
      {
        revisadoPorId: acceso.sesion.sub,
        decision: datos.data.decision,
        comentario: datos.data.comentario?.trim() || null,
      },
      {
        repositorio: prismaSolicitudReemplazoBioestadisticaRepository,
        repositorioVentanas: prismaVentanaCargaRepository,
      },
    );

    if (!resultado.ok) {
      auditarBioestadistica(acceso.sesion, transporte, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        solicitudReemplazoBioestadisticaId: idValido.data,
      });

      if (resultado.motivo === "NO_ENCONTRADO") return respuestaNoEncontrada();

      return respuestaError("Esta solicitud ya fue resuelta por otra persona", 409, { codigo: "SOLICITUD_YA_RESUELTA" });
    }

    const { solicitud } = resultado;

    auditarBioestadistica(acceso.sesion, transporte, {
      accion: ACCION,
      resultado: "EXITO",
      anio: solicitud.anio,
      tipoArchivoBioestadistica: solicitud.tipoArchivo,
      cargaBioestadisticaId: solicitud.cargaBioestadisticaId,
      solicitudReemplazoBioestadisticaId: solicitud.id,
      estadoSolicitud: solicitud.estado === "APROBADA" ? "APROBADA" : "RECHAZADA",
      diasVigencia: solicitud.diasVigencia,
    });

    after(() => notificarResultado(solicitud));

    return NextResponse.json({ solicitud: { id: solicitud.id, estado: solicitud.estado } });
  } catch (error) {
    logger.error("Error al revisar una solicitud de reemplazo de Bioestadística", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
