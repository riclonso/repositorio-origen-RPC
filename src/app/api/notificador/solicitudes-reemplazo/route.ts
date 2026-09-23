import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { solicitarReemplazoCarga } from "@/modules/solicitudes-reemplazo/application/use-cases/SolicitarReemplazoCarga";
import { listarSolicitudesReemplazoPropias } from "@/modules/solicitudes-reemplazo/application/use-cases/ListarSolicitudesReemplazoPropias";
import { prismaSolicitudReemplazoCargaRepository } from "@/modules/solicitudes-reemplazo/infrastructure/repositories/PrismaSolicitudReemplazoCargaRepository";
import { prismaCargaArchivoRepository } from "@/modules/reporte-excel/infrastructure/repositories/PrismaCargaArchivoRepository";
import { auditarSolicitudReemplazo } from "@/modules/solicitudes-reemplazo/infrastructure/auditoria/auditarSolicitudReemplazo";
import { solicitarReemplazoSchema } from "@/modules/solicitudes-reemplazo/schemas/solicitud-reemplazo.schema";
import {
  MENSAJE_DATOS_INVALIDOS,
  MENSAJE_ERROR_INTERNO,
  aSolicitudReemplazoPropiaDTO,
  exigirNotificador,
  respuestaError,
  respuestaNoEncontrado,
  respuestaNoEsVigente,
  respuestaSinAcceso,
  respuestaSolicitudDuplicada,
  respuestaSolicitudYaAprobadaVigente,
} from "@/app/api/notificador/solicitudes-reemplazo/_lib/http";

const ACCION = "SOLICITUD_REEMPLAZO_CREADA" as const;

// "Mis solicitudes" (seguimiento propio, solo lectura) y el estado inline en la tarjeta de subida.
// Lectura, no se audita.
export async function GET() {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  try {
    const resultado = await listarSolicitudesReemplazoPropias(acceso.sesion.sub, {
      repositorio: prismaSolicitudReemplazoCargaRepository,
    });

    const ahora = new Date();

    return NextResponse.json({
      datos: resultado.solicitudes.map((solicitud) => aSolicitudReemplazoPropiaDTO(solicitud, ahora)),
    });
  } catch (error) {
    logger.error("Error al listar las solicitudes de reemplazo propias de un notificador", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}

// Solicita reemplazar una carga propia ya APROBADA. La aprobación de un ADMIN o
// REVISOR_REPOSITORIO (`PATCH /api/dashboard/solicitudes-reemplazo/[id]`) habilita la subida real.
export async function POST(request: Request) {
  const acceso = await exigirNotificador();

  if (!acceso.ok) {
    return respuestaSinAcceso(acceso.estado);
  }

  const cuerpo = await request.json().catch(() => null);
  const datos = solicitarReemplazoSchema.safeParse(cuerpo);

  if (!datos.success) {
    return respuestaError(datos.error.issues[0]?.message ?? MENSAJE_DATOS_INVALIDOS, 400);
  }

  try {
    const resultado = await solicitarReemplazoCarga(
      {
        cargaArchivoId: datos.data.cargaArchivoId,
        usuarioId: acceso.sesion.sub,
        motivo: datos.data.motivo,
      },
      {
        repositorio: prismaSolicitudReemplazoCargaRepository,
        repositorioCargas: prismaCargaArchivoRepository,
      },
    );

    if (!resultado.ok) {
      auditarSolicitudReemplazo(acceso.sesion, request, {
        accion: ACCION,
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        cargaArchivoId: datos.data.cargaArchivoId,
      });

      if (resultado.motivo === "NO_ENCONTRADO") {
        return respuestaNoEncontrado();
      }

      if (resultado.motivo === "NO_ES_VIGENTE") {
        return respuestaNoEsVigente();
      }

      if (resultado.motivo === "SOLICITUD_YA_APROBADA_VIGENTE") {
        return respuestaSolicitudYaAprobadaVigente();
      }

      return respuestaSolicitudDuplicada();
    }

    auditarSolicitudReemplazo(acceso.sesion, request, {
      accion: ACCION,
      resultado: "EXITO",
      cargaArchivoId: resultado.solicitud.cargaArchivoId,
      solicitudReemplazoId: resultado.solicitud.id,
    });

    return NextResponse.json(
      { solicitud: aSolicitudReemplazoPropiaDTO(resultado.solicitud, new Date()) },
      { status: 201 },
    );
  } catch (error) {
    logger.error("Error al solicitar el reemplazo de una carga de archivo", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
