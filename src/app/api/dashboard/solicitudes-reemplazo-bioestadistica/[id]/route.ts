import { NextResponse, after } from "next/server";
import { ejecutarAvisoCorreo } from "@/infrastructure/email/ejecutarAvisoCorreo";
import { destinatarioUsuario } from "@/infrastructure/logging/fallasCorreo";
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
// RF-44: cada falla (sin SMTP, preparación o envío) queda en `fallas-correo.txt`. Bioestadística no
// pertenece a una ventana de carga: el registro va sin ventana.
function notificarResultado(solicitud: SolicitudReemplazoBioestadistica): Promise<void> {
  return ejecutarAvisoCorreo({
    tipoAviso: "RESULTADO_SOLICITUD_REEMPLAZO_BIOESTADISTICA",
    referencias: { solicitudReemplazoBioestadisticaId: solicitud.id },
    destinatarioConocido: {
      tipo: "USUARIO",
      usuarioId: solicitud.solicitadoPorId,
      nombre: solicitud.solicitadoPorNombre,
      rut: solicitud.solicitadoPorRut,
    },
    disponible: () => solicitudReemplazoBioestadisticaMailer.disponible(),
    preparar: async () => {
      const [destinatario, resumenes] = await Promise.all([
        prismaUsuarioRepository.obtenerPorId(solicitud.solicitadoPorId),
        prismaVentanaCargaRepository.listarDiasVigenciaPorAnio([solicitud.anio]),
      ]);
      if (!destinatario) return null;

      const resumenAnio = resumenes.find((resumen) => resumen.anio === solicitud.anio) ?? null;
      return { destinatario, venceEl: fechaVencimientoSolicitudBioestadistica(solicitud, resumenAnio) };
    },
    destinatarioDe: ({ destinatario }) => destinatarioUsuario(destinatario),
    enviar: ({ destinatario, venceEl }) =>
      solicitudReemplazoBioestadisticaMailer.enviarResultadoRevision({
        destinatario: { nombres: destinatario.nombres, email: destinatario.email },
        tipoArchivo: solicitud.tipoArchivo,
        anio: solicitud.anio,
        nombreArchivoOriginal: solicitud.nombreArchivoOriginal,
        estado: solicitud.estado === "APROBADA" ? "APROBADA" : "RECHAZADA",
        comentarioRevision: solicitud.comentarioRevision,
        venceEl,
      }),
  });
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
